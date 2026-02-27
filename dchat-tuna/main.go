package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"sync"
	"time"

	nkn "github.com/nknorg/nkn-sdk-go"
	ts "github.com/nknorg/nkn-tuna-session"
	"github.com/nknorg/ncp-go"
	"github.com/nknorg/tuna/geo"
)

// JSON-RPC request from Electron main process
type Request struct {
	ID     int             `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

// JSON-RPC response to Electron main process
type Response struct {
	ID     int         `json:"id,omitempty"`
	Result interface{} `json:"result,omitempty"`
	Error  string      `json:"error,omitempty"`
}

// Unsolicited event pushed to Electron main process
type Event struct {
	Event     string `json:"event"`
	SessionID string `json:"sessionId,omitempty"`
	Data      string `json:"data,omitempty"`
	RemoteAddr string `json:"remoteAddr,omitempty"`
	Reason    string `json:"reason,omitempty"`
	Message   string `json:"message,omitempty"`
}

// Active TUNA session
type ActiveSession struct {
	ID         string
	RemoteAddr string
	Conn       net.Conn
	Done       chan struct{}
}

// Server manages the TUNA session lifecycle
type Server struct {
	mu          sync.Mutex
	account     *nkn.Account
	wallet      *nkn.Wallet
	tunaSession *ts.TunaSessionClient
	sessions    map[string]*ActiveSession
	maxPrice    string
	writer      *json.Encoder
	writerMu    sync.Mutex
	listening   bool
	pendingConns chan net.Conn
}

func NewServer(writer io.Writer) *Server {
	return &Server{
		sessions:     make(map[string]*ActiveSession),
		writer:       json.NewEncoder(writer),
		pendingConns: make(chan net.Conn, 16),
	}
}

func (s *Server) sendResponse(resp Response) {
	s.writerMu.Lock()
	defer s.writerMu.Unlock()
	_ = s.writer.Encode(resp)
}

func (s *Server) sendEvent(evt Event) {
	s.writerMu.Lock()
	defer s.writerMu.Unlock()
	_ = s.writer.Encode(evt)
}

// init: Initialize NKN account and TUNA session client
func (s *Server) handleInit(id int, params json.RawMessage) {
	var p struct {
		Seed     string `json:"seed"`
		MaxPrice string `json:"maxPrice"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if p.MaxPrice == "" {
		p.MaxPrice = "0.01"
	}
	s.maxPrice = p.MaxPrice

	account, err := nkn.NewAccount(hexToBytes(p.Seed))
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("failed to create account: %v", err)})
		return
	}
	s.account = account

	wallet, err := nkn.NewWallet(account, nkn.GetDefaultWalletConfig())
	if err != nil {
		// Non-fatal: wallet for balance check only
		log.Printf("Warning: failed to create wallet: %v", err)
	}
	s.wallet = wallet

	// Create TUNA session client
	clientConfig := nkn.GetDefaultClientConfig()
	clientConfig.ConnectRetries = 1

	tsConfig := &ts.Config{
		NumTunaListeners:      4,
		TunaMaxPrice:          s.maxPrice,
		TunaDialTimeout:       10000,
		TunaNanoPayFee:        "0",
		TunaServiceName:       "dchat-voice",
		SessionConfig:         &ncp.Config{MTU: int32(1300)},
		TunaIPFilter:          &geo.IPFilter{},
	}

	tunaSession, err := ts.NewTunaSessionClient(account, nil, nil, tsConfig)
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("failed to create TUNA session: %v", err)})
		return
	}
	s.tunaSession = tunaSession

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
}

// dial: Connect to a remote peer via TUNA
func (s *Server) handleDial(id int, params json.RawMessage) {
	var p struct {
		RemoteAddr string `json:"remoteAddr"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if s.tunaSession == nil {
		s.sendResponse(Response{ID: id, Error: "not initialized"})
		return
	}

	conn, err := s.tunaSession.Dial(p.RemoteAddr)
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("dial failed: %v", err)})
		return
	}

	sessionID := fmt.Sprintf("call-%d", time.Now().UnixNano())
	session := &ActiveSession{
		ID:         sessionID,
		RemoteAddr: p.RemoteAddr,
		Conn:       conn,
		Done:       make(chan struct{}),
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	// Start reading audio data from the connection
	go s.readLoop(session)

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"sessionId": sessionID}})
}

// listen: Start listening for incoming TUNA sessions
func (s *Server) handleListen(id int) {
	if s.tunaSession == nil {
		s.sendResponse(Response{ID: id, Error: "not initialized"})
		return
	}

	s.mu.Lock()
	if s.listening {
		s.mu.Unlock()
		s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
		return
	}
	s.listening = true
	s.mu.Unlock()

	err := s.tunaSession.Listen(nil)
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("listen failed: %v", err)})
		return
	}

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})

	// Accept connections in background
	go func() {
		for {
			conn, err := s.tunaSession.Accept()
			if err != nil {
				log.Printf("Accept error: %v", err)
				return
			}

			sessionID := fmt.Sprintf("call-%d", time.Now().UnixNano())
			remoteAddr := conn.RemoteAddr().String()

			session := &ActiveSession{
				ID:         sessionID,
				RemoteAddr: remoteAddr,
				Conn:       conn,
				Done:       make(chan struct{}),
			}

			s.mu.Lock()
			s.sessions[sessionID] = session
			s.mu.Unlock()

			// Notify Electron about incoming connection
			s.sendEvent(Event{
				Event:      "incoming",
				SessionID:  sessionID,
				RemoteAddr: remoteAddr,
			})

			// Start reading audio immediately (caller starts sending after accept)
			go s.readLoop(session)
		}
	}()
}

// accept: Accept a pending incoming session (already accepted at transport level)
func (s *Server) handleAccept(id int, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	s.mu.Lock()
	_, exists := s.sessions[p.SessionID]
	s.mu.Unlock()

	if !exists {
		s.sendResponse(Response{ID: id, Error: "session not found"})
		return
	}

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
}

// reject: Close and remove a pending session
func (s *Server) handleReject(id int, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	s.closeSession(p.SessionID, "rejected")
	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
}

// sendAudio: Send audio data over a TUNA session
func (s *Server) handleSendAudio(id int, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
		Data      string `json:"data"` // base64-encoded Opus frame
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	s.mu.Lock()
	session, exists := s.sessions[p.SessionID]
	s.mu.Unlock()

	if !exists {
		s.sendResponse(Response{ID: id, Error: "session not found"})
		return
	}

	data, err := base64.StdEncoding.DecodeString(p.Data)
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid base64: %v", err)})
		return
	}

	// Frame format: 2-byte big-endian length prefix + payload
	frame := make([]byte, 2+len(data))
	frame[0] = byte(len(data) >> 8)
	frame[1] = byte(len(data))
	copy(frame[2:], data)

	_, err = session.Conn.Write(frame)
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("write failed: %v", err)})
		s.closeSession(p.SessionID, "write error")
		return
	}

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
}

// hangup: Close an active session
func (s *Server) handleHangup(id int, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	s.closeSession(p.SessionID, "hangup")
	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
}

// getBalance: Get NKN wallet balance
func (s *Server) handleGetBalance(id int) {
	if s.wallet == nil {
		s.sendResponse(Response{ID: id, Error: "wallet not available"})
		return
	}

	balance, err := s.wallet.Balance()
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("balance check failed: %v", err)})
		return
	}

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"balance": balance.String()}})
}

// shutdown: Clean up all sessions and exit
func (s *Server) handleShutdown(id int) {
	s.mu.Lock()
	for sid := range s.sessions {
		s.closeSessionLocked(sid, "shutdown")
	}
	s.mu.Unlock()

	if s.tunaSession != nil {
		s.tunaSession.Close()
	}

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})

	// Give response time to flush
	time.Sleep(100 * time.Millisecond)
	os.Exit(0)
}

// readLoop reads length-prefixed audio frames from a session and emits events
func (s *Server) readLoop(session *ActiveSession) {
	defer s.closeSession(session.ID, "connection closed")

	reader := bufio.NewReaderSize(session.Conn, 64*1024)
	header := make([]byte, 2)

	for {
		select {
		case <-session.Done:
			return
		default:
		}

		// Read 2-byte length prefix
		_, err := io.ReadFull(reader, header)
		if err != nil {
			if err != io.EOF {
				s.sendEvent(Event{
					Event:     "error",
					SessionID: session.ID,
					Message:   fmt.Sprintf("read error: %v", err),
				})
			}
			return
		}

		frameLen := int(header[0])<<8 | int(header[1])
		if frameLen == 0 || frameLen > 32000 {
			continue // skip invalid frames
		}

		frame := make([]byte, frameLen)
		_, err = io.ReadFull(reader, frame)
		if err != nil {
			return
		}

		// Send audio data to Electron
		s.sendEvent(Event{
			Event:     "audioData",
			SessionID: session.ID,
			Data:      base64.StdEncoding.EncodeToString(frame),
		})
	}
}

func (s *Server) closeSession(sessionID string, reason string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closeSessionLocked(sessionID, reason)
}

func (s *Server) closeSessionLocked(sessionID string, reason string) {
	session, exists := s.sessions[sessionID]
	if !exists {
		return
	}

	select {
	case <-session.Done:
		// already closed
	default:
		close(session.Done)
	}

	_ = session.Conn.Close()
	delete(s.sessions, sessionID)

	s.sendEvent(Event{
		Event:     "sessionClosed",
		SessionID: sessionID,
		Reason:    reason,
	})
}

func hexToBytes(hex string) []byte {
	if len(hex)%2 != 0 {
		return nil
	}
	b := make([]byte, len(hex)/2)
	for i := 0; i < len(hex); i += 2 {
		var val byte
		for j := 0; j < 2; j++ {
			c := hex[i+j]
			switch {
			case c >= '0' && c <= '9':
				val = val*16 + (c - '0')
			case c >= 'a' && c <= 'f':
				val = val*16 + (c - 'a' + 10)
			case c >= 'A' && c <= 'F':
				val = val*16 + (c - 'A' + 10)
			}
		}
		b[i/2] = val
	}
	return b
}

func main() {
	log.SetOutput(os.Stderr) // Keep stderr for debug logs, stdout for JSON-RPC
	log.SetPrefix("[dchat-tuna] ")

	server := NewServer(os.Stdout)
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB max line

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req Request
		if err := json.Unmarshal(line, &req); err != nil {
			server.sendResponse(Response{Error: fmt.Sprintf("invalid JSON: %v", err)})
			continue
		}

		switch req.Method {
		case "init":
			go server.handleInit(req.ID, req.Params)
		case "dial":
			go server.handleDial(req.ID, req.Params)
		case "listen":
			go server.handleListen(req.ID)
		case "accept":
			go server.handleAccept(req.ID, req.Params)
		case "reject":
			go server.handleReject(req.ID, req.Params)
		case "sendAudio":
			// sendAudio is hot path — handle synchronously to maintain order
			server.handleSendAudio(req.ID, req.Params)
		case "hangup":
			go server.handleHangup(req.ID, req.Params)
		case "getBalance":
			go server.handleGetBalance(req.ID)
		case "shutdown":
			go server.handleShutdown(req.ID)
		default:
			server.sendResponse(Response{ID: req.ID, Error: fmt.Sprintf("unknown method: %s", req.Method)})
		}
	}
}
