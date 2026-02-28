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
	Event      string `json:"event"`
	SessionID  string `json:"sessionId,omitempty"`
	Data       string `json:"data,omitempty"`
	RemoteAddr string `json:"remoteAddr,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Message    string `json:"message,omitempty"`
}

// Active TUNA session
type ActiveSession struct {
	ID         string
	RemoteAddr string
	Conn       net.Conn
	Done       chan struct{}
	WriteCh    chan []byte // Serialized write channel — prevents concurrent Conn.Write
}

// Server manages the TUNA session lifecycle
type Server struct {
	mu           sync.Mutex
	account      *nkn.Account
	wallet       *nkn.Wallet
	multiClient  *nkn.MultiClient
	tunaSession  *ts.TunaSessionClient
	sessions     map[string]*ActiveSession
	maxPrice     string
	writer       *json.Encoder
	writerMu     sync.Mutex
	listening    bool
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

// init: Initialize NKN account, MultiClient, and TUNA session client
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

	wallet, err := nkn.NewWallet(account, nil)
	if err != nil {
		log.Printf("Warning: failed to create wallet: %v", err)
	}
	s.wallet = wallet

	// Create NKN MultiClient — match example: ConnectRetries=1
	clientConfig := &nkn.ClientConfig{ConnectRetries: 1}

	multiClient, err := nkn.NewMultiClient(account, "dchat-tuna", 4, false, clientConfig)
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("failed to create NKN client: %v", err)})
		return
	}
	s.multiClient = multiClient

	// Wait for NKN client to connect
	select {
	case <-multiClient.OnConnect.C:
		log.Printf("NKN client connected: %s", multiClient.Addr().String())
	case <-time.After(30 * time.Second):
		multiClient.Close()
		s.sendResponse(Response{ID: id, Error: "NKN client connect timeout"})
		return
	}

	// Create TUNA session client — match example pattern closely
	tsConfig := &ts.Config{
		NumTunaListeners: 1,
		TunaMaxPrice:     s.maxPrice,
		TunaIPFilter:     &geo.IPFilter{},
		SessionConfig:    &ncp.Config{MTU: int32(1300)},
		Verbose:          true,
	}

	tunaSession, err := ts.NewTunaSessionClient(account, multiClient, wallet, tsConfig)
	if err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("failed to create TUNA session: %v", err)})
		return
	}
	s.tunaSession = tunaSession

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
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
	log.Printf("Listening at %s", s.tunaSession.Addr())

	// Start Accept loop BEFORE waiting for OnConnect (matches example pattern)
	go func() {
		for {
			conn, err := s.tunaSession.Accept()
			if err != nil {
				log.Printf("Accept error: %v", err)
				return
			}

			sessionID := fmt.Sprintf("call-%d", time.Now().UnixNano())
			remoteAddr := conn.RemoteAddr().String()
			log.Printf("Accepted session %s from %s", sessionID, remoteAddr)

			session := s.createSession(sessionID, remoteAddr, conn)

			s.mu.Lock()
			s.sessions[sessionID] = session
			s.mu.Unlock()

			// Notify Electron about incoming connection
			s.sendEvent(Event{
				Event:      "incoming",
				SessionID:  sessionID,
				RemoteAddr: remoteAddr,
			})

			// Start writer and reader goroutines
			go s.writeLoop(session)
			go s.readLoop(session)
		}
	}()

	// Wait for TUNA relay connections — BLOCK until ready (matches example)
	log.Printf("Waiting for TUNA relay connections...")
	select {
	case <-s.tunaSession.OnConnect():
		log.Printf("TUNA listener ready (relay connections established)")
	case <-time.After(120 * time.Second):
		log.Printf("Warning: TUNA OnConnect timed out after 120s")
	}

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

	log.Printf("Dialing TUNA to %s ...", p.RemoteAddr)
	dialConfig := &nkn.DialConfig{DialTimeout: 30000}
	conn, err := s.tunaSession.DialWithConfig(p.RemoteAddr, dialConfig)
	if err != nil {
		log.Printf("Dial to %s failed: %v", p.RemoteAddr, err)
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("dial failed: %v", err)})
		return
	}
	log.Printf("Dial to %s succeeded", p.RemoteAddr)

	sessionID := fmt.Sprintf("call-%d", time.Now().UnixNano())
	session := s.createSession(sessionID, p.RemoteAddr, conn)

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	// Start writer and reader goroutines
	go s.writeLoop(session)
	go s.readLoop(session)

	// Send a connectivity test frame (zero-length payload = ping)
	log.Printf("Sending connectivity ping on session %s", sessionID)
	select {
	case session.WriteCh <- []byte{0, 0}:
	default:
		log.Printf("Warning: WriteCh full, could not send ping")
	}

	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"sessionId": sessionID}})
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

// sendAudio: Queue audio data for serialized writing (fire-and-forget, no response)
func (s *Server) handleSendAudio(id int, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
		Data      string `json:"data"` // base64-encoded Opus frame
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return // silently drop malformed
	}

	s.mu.Lock()
	session, exists := s.sessions[p.SessionID]
	s.mu.Unlock()

	if !exists {
		return // session gone, silently drop
	}

	data, err := base64.StdEncoding.DecodeString(p.Data)
	if err != nil {
		return // silently drop
	}

	// Frame format: 2-byte big-endian length prefix + payload
	frame := make([]byte, 2+len(data))
	frame[0] = byte(len(data) >> 8)
	frame[1] = byte(len(data))
	copy(frame[2:], data)

	// Queue for serialized writing — non-blocking to avoid stalling stdin reader
	select {
	case session.WriteCh <- frame:
	default:
		// Channel full — drop frame (backpressure)
		log.Printf("Warning: WriteCh full for session %s, dropping audio frame", p.SessionID)
	}
	// NO response sent — fire and forget
}

// writeLoop drains the WriteCh and writes frames serially to session.Conn
func (s *Server) writeLoop(session *ActiveSession) {
	log.Printf("writeLoop started for session %s", session.ID)
	writeCount := 0

	for {
		select {
		case <-session.Done:
			log.Printf("writeLoop %s: done after %d writes", session.ID, writeCount)
			return
		case frame, ok := <-session.WriteCh:
			if !ok {
				log.Printf("writeLoop %s: channel closed after %d writes", session.ID, writeCount)
				return
			}

			session.Conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			_, err := session.Conn.Write(frame)
			session.Conn.SetWriteDeadline(time.Time{})

			if err != nil {
				log.Printf("writeLoop %s: write error after %d writes: %v", session.ID, writeCount, err)
				s.sendEvent(Event{
					Event:     "error",
					SessionID: session.ID,
					Message:   fmt.Sprintf("audio write failed: %v", err),
				})
				s.closeSession(session.ID, "write error")
				return
			}

			writeCount++
			if writeCount <= 3 || writeCount%200 == 0 {
				log.Printf("writeLoop %s: wrote frame #%d, size=%d", session.ID, writeCount, len(frame))
			}
		}
	}
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

// testNkn: Test NKN connectivity to a remote address
func (s *Server) handleTestNkn(id int, params json.RawMessage) {
	var p struct {
		RemoteAddr string `json:"remoteAddr"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if s.multiClient == nil {
		s.sendResponse(Response{ID: id, Error: "not initialized"})
		return
	}

	log.Printf("Testing NKN send to %s ...", p.RemoteAddr)
	onReply, err := s.multiClient.Send(
		nkn.NewStringArray(p.RemoteAddr),
		[]byte("ping"),
		nil,
	)
	if err != nil {
		log.Printf("NKN send to %s failed: %v", p.RemoteAddr, err)
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("send failed: %v", err)})
		return
	}

	select {
	case reply := <-onReply.C:
		if reply != nil {
			log.Printf("NKN reply from %s: %d bytes", p.RemoteAddr, len(reply.Data))
			s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true, "replyBytes": len(reply.Data)}})
		} else {
			log.Printf("NKN reply from %s: nil", p.RemoteAddr)
			s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true, "reply": "nil"}})
		}
	case <-time.After(15 * time.Second):
		log.Printf("NKN send to %s: no reply in 15s", p.RemoteAddr)
		s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": false, "reason": "no reply in 15s"}})
	}
}

// getPubAddrs: Get this client's TUNA public addresses for diagnostic
func (s *Server) handleGetPubAddrs(id int) {
	if s.tunaSession == nil {
		s.sendResponse(Response{ID: id, Error: "not initialized"})
		return
	}

	pubAddrs := s.tunaSession.GetPubAddrs()
	if pubAddrs == nil {
		log.Printf("GetPubAddrs: nil (no TUNA exits)")
		s.sendResponse(Response{ID: id, Result: map[string]interface{}{"addrs": nil}})
		return
	}

	// Serialize to JSON for logging
	buf, _ := json.Marshal(pubAddrs)
	log.Printf("GetPubAddrs: %s", string(buf))
	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"addrs": json.RawMessage(buf)}})
}

// setPubAddrs: Pre-cache remote TUNA relay addresses (bypasses broken Go-to-Go NKN messaging)
func (s *Server) handleSetPubAddrs(id int, params json.RawMessage) {
	var p struct {
		RemoteAddr string `json:"remoteAddr"`
		PubAddrs   string `json:"pubAddrs"` // JSON-encoded PubAddrs from remote via JS NKN signaling
	}
	if err := json.Unmarshal(params, &p); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if s.tunaSession == nil {
		s.sendResponse(Response{ID: id, Error: "not initialized"})
		return
	}

	pubAddrs := &ts.PubAddrs{}
	if err := json.Unmarshal([]byte(p.PubAddrs), pubAddrs); err != nil {
		s.sendResponse(Response{ID: id, Error: fmt.Sprintf("invalid pubAddrs JSON: %v", err)})
		return
	}

	log.Printf("SetPubAddrs for %s: %s", p.RemoteAddr, p.PubAddrs)
	s.tunaSession.SetCachedPubAddrs(p.RemoteAddr, pubAddrs)
	s.sendResponse(Response{ID: id, Result: map[string]interface{}{"ok": true}})
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

	time.Sleep(100 * time.Millisecond)
	os.Exit(0)
}

// createSession builds an ActiveSession with a write channel
func (s *Server) createSession(id, remoteAddr string, conn net.Conn) *ActiveSession {
	return &ActiveSession{
		ID:         id,
		RemoteAddr: remoteAddr,
		Conn:       conn,
		Done:       make(chan struct{}),
		WriteCh:    make(chan []byte, 256), // buffer ~5s of audio at 50fps
	}
}

// readLoop reads length-prefixed audio frames from a session and emits events
func (s *Server) readLoop(session *ActiveSession) {
	defer s.closeSession(session.ID, "connection closed")
	log.Printf("readLoop started for session %s", session.ID)

	reader := bufio.NewReaderSize(session.Conn, 64*1024)
	header := make([]byte, 2)
	frameCount := 0

	for {
		select {
		case <-session.Done:
			return
		default:
		}

		_, err := io.ReadFull(reader, header)
		if err != nil {
			log.Printf("readLoop %s: read error after %d frames: %v", session.ID, frameCount, err)
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

		// Zero-length frame = connectivity ping — log and skip
		if frameLen == 0 {
			log.Printf("readLoop %s: received connectivity ping!", session.ID)
			continue
		}
		if frameLen > 32000 {
			log.Printf("readLoop %s: skipping invalid frame len=%d", session.ID, frameLen)
			continue
		}

		frame := make([]byte, frameLen)
		_, err = io.ReadFull(reader, frame)
		if err != nil {
			log.Printf("readLoop %s: frame body read error after %d frames: %v", session.ID, frameCount, err)
			return
		}

		frameCount++
		if frameCount <= 3 || frameCount%100 == 0 {
			log.Printf("readLoop %s: received frame #%d, size=%d", session.ID, frameCount, frameLen)
		}

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
	log.SetOutput(os.Stderr)
	log.SetPrefix("[dchat-tuna] ")

	server := NewServer(os.Stdout)
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

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
			server.handleSendAudio(req.ID, req.Params)
		case "hangup":
			go server.handleHangup(req.ID, req.Params)
		case "getBalance":
			go server.handleGetBalance(req.ID)
		case "testNkn":
			go server.handleTestNkn(req.ID, req.Params)
		case "getPubAddrs":
			go server.handleGetPubAddrs(req.ID)
		case "setPubAddrs":
			go server.handleSetPubAddrs(req.ID, req.Params)
		case "shutdown":
			go server.handleShutdown(req.ID)
		default:
			server.sendResponse(Response{ID: req.ID, Error: fmt.Sprintf("unknown method: %s", req.Method)})
		}
	}
}
