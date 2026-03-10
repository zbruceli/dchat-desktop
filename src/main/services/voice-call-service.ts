import { spawn, type ChildProcess } from "child_process";
import { app } from "electron";
import path from "path";
import crypto from "crypto";
import { EventEmitter } from "events";
import type { NknClientService } from "./nkn-client-service";
import type { CallState, CallType, VoiceCallSignal, VoiceCallStateUpdate, IncomingCallInfo } from "../../shared/types";
import { IPC } from "../../shared/ipc-channels";

interface SidecarRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface SidecarResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: string;
  // Events (unsolicited)
  event?: string;
  sessionId?: string;
  data?: string;
  remoteAddr?: string;
  reason?: string;
  message?: string;
}

interface ActiveCall {
  callId: string;
  remoteAddress: string;
  state: CallState;
  tunaSessionId?: string;
  startedAt?: number;
  callType: CallType;
  isVideoEnabled: boolean;
}

const VOICE_CALL_CONTENT_TYPES = new Set([
  "voiceCall:invite",
  "voiceCall:accept",
  "voiceCall:decline",
  "voiceCall:end",
  "voiceCall:videoToggle",
]);

const MIN_BALANCE_NKN = 1;
const MAX_PRICE_PER_MB = "0.01";

export { VOICE_CALL_CONTENT_TYPES };

export class VoiceCallService extends EventEmitter {
  private sidecar: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>();
  private activeCall: ActiveCall | null = null;
  private incomingCall: IncomingCallInfo | null = null;
  private pendingTunaSessionId: string | null = null;
  private seed: string;
  private sidecarReady = false;
  private cachedPubAddrs: string | null = null;
  private lineBuffer = "";

  constructor(
    private nknClient: NknClientService,
    private pushToRenderer: (channel: string, data: unknown) => void,
    seed: string,
  ) {
    super();
    this.seed = seed;
  }

  /** Start sidecar as caller: init + listen + getPubAddrs (caller listens for incoming dial) */
  async start(): Promise<void> {
    if (this.sidecar) return;
    await this.spawnSidecar();

    // Initialize the sidecar with the same NKN seed (same account/pubkey)
    await this.sendCommand("init", {
      seed: this.seed,
      maxPrice: MAX_PRICE_PER_MB,
    });

    // Caller listens for incoming TUNA sessions (callee will dial us)
    await this.sendCommand("listen", {});
    this.sidecarReady = true;

    // Fetch and cache our TUNA pubAddrs for signaling exchange (must complete before calls)
    // Retry because relay connection may still be establishing after listen returns
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const r = await this.sendCommand("getPubAddrs", {});
        const addrs = r.addrs;
        if (addrs) {
          this.cachedPubAddrs = JSON.stringify(addrs);
          console.log("[VoiceCall] Our TUNA pubAddrs:", this.cachedPubAddrs);
          break;
        }
        console.warn(`[VoiceCall] No TUNA pubAddrs yet (attempt ${attempt + 1}/15)`);
      } catch (e) {
        console.error(`[VoiceCall] getPubAddrs failed (attempt ${attempt + 1}/15):`, e);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (!this.cachedPubAddrs) {
      console.error("[VoiceCall] Failed to get TUNA pubAddrs after all retries");
    }
  }

  /** Start sidecar as callee: init only (callee will dial the caller, no listen needed) */
  async startForDial(): Promise<void> {
    if (this.sidecar) return;
    await this.spawnSidecar();

    await this.sendCommand("init", {
      seed: this.seed,
      maxPrice: MAX_PRICE_PER_MB,
    });

    this.sidecarReady = true;
    console.log("[VoiceCall] Sidecar ready for dial (callee mode, no listen)");
  }

  private async spawnSidecar(): Promise<void> {
    const binaryName = process.platform === "win32" ? "dchat-tuna.exe" : "dchat-tuna";
    const binaryPath = app.isPackaged
      ? path.join(process.resourcesPath, binaryName)
      : path.join(app.getAppPath(), "dchat-tuna", "bin", binaryName);

    this.sidecar = spawn(binaryPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Prevent EPIPE from becoming an uncaught exception when sidecar exits
    this.sidecar.stdin?.on("error", (err) => {
      console.warn("[VoiceCall] Sidecar stdin error:", err.message);
    });

    this.sidecar.stdout?.on("data", (chunk: Buffer) => {
      this.lineBuffer += chunk.toString();
      const lines = this.lineBuffer.split(/\r?\n/);
      this.lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          this.handleSidecarMessage(line.trim());
        }
      }
    });

    this.sidecar.stderr?.on("data", (chunk: Buffer) => {
      console.log("[dchat-tuna]", chunk.toString().trim());
    });

    this.sidecar.on("exit", (code) => {
      console.log(`[VoiceCall] Sidecar exited with code ${code}`);
      this.sidecar = null;
      this.sidecarReady = false;
      if (this.activeCall && this.activeCall.state !== "ended") {
        this.endCallInternal("sidecar exited");
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.sidecar) return;
    try {
      await this.sendCommand("shutdown", {});
    } catch {
      // Force kill if shutdown fails
      this.sidecar?.kill("SIGTERM");
    }
    this.sidecar = null;
    this.sidecarReady = false;
  }

  /** Handle incoming voiceCall signaling messages from NKN */
  handleSignalingMessage(src: string, contentType: string, content: string): void {
    let signal: VoiceCallSignal;
    try {
      signal = JSON.parse(content);
    } catch {
      console.error("[VoiceCall] Invalid signal content:", content);
      return;
    }

    console.log(`[VoiceCall] Signaling: ${contentType} from ${src.substring(0, 8)}... tunaPubAddrs=${!!signal.tunaPubAddrs}`);

    switch (contentType) {
      case "voiceCall:invite":
        this.handleIncomingInvite(src, signal);
        break;
      case "voiceCall:accept":
        this.handleRemoteAccept(src, signal);
        break;
      case "voiceCall:decline":
        this.handleRemoteDecline(src, signal);
        break;
      case "voiceCall:end":
        this.handleRemoteEnd(src, signal);
        break;
      case "voiceCall:videoToggle":
        this.handleRemoteVideoToggle(src, signal);
        break;
    }
  }

  /** Start an outgoing call */
  async startCall(targetAddress: string, callType: CallType = "voice"): Promise<void> {
    if (this.activeCall) {
      throw new Error("A call is already active");
    }

    const callId = crypto.randomUUID();

    // Show "Ringing" in UI immediately — don't wait for sidecar
    this.activeCall = {
      callId,
      remoteAddress: targetAddress,
      state: "ringing",
      callType,
      isVideoEnabled: callType === "video",
    };
    this.pushCallState();

    // Ensure sidecar is ready (may take seconds for init + listen + getPubAddrs)
    try {
      if (!this.sidecarReady) {
        await this.start();
      }
    } catch (err) {
      console.error("[VoiceCall] Sidecar start failed:", err);
      this.endCallInternal("sidecar start failed");
      return;
    }

    // Bail if call was ended while sidecar was starting
    if (!this.activeCall || this.activeCall.callId !== callId) return;

    // Send invite via NKN signaling (include our TUNA pubAddrs so remote can pre-cache them)
    const signal: VoiceCallSignal = {
      callId,
      codec: "opus",
      sampleRate: 48000,
      tunaPubAddrs: this.cachedPubAddrs ?? undefined,
      callType,
      videoCodec: callType === "video" ? "vp8" : undefined,
    };
    console.log(`[VoiceCall] Sending invite with tunaPubAddrs: ${!!signal.tunaPubAddrs}, callType: ${callType}`);

    this.nknClient.sendMessageNoReply(targetAddress, JSON.stringify({
      id: callId,
      contentType: "voiceCall:invite",
      content: JSON.stringify(signal),
      timestamp: Date.now(),
    }));

    // Stay in "ringing" state — TUNA dial happens after remote accepts
  }

  /** Accept an incoming call (callee: init sidecar, send accept, then dial caller) */
  async acceptCall(callId: string): Promise<void> {
    if (!this.incomingCall || this.incomingCall.callId !== callId) {
      throw new Error("No matching incoming call");
    }

    const remoteAddress = this.incomingCall.remoteAddress;
    const callerPubAddrs = this.incomingCall.tunaPubAddrs;
    const callType = this.incomingCall.callType ?? "voice";

    this.activeCall = {
      callId,
      remoteAddress,
      state: "connecting",
      callType,
      isVideoEnabled: callType === "video",
    };
    this.incomingCall = null;
    this.pushCallState();

    // Start sidecar in dial-only mode (no listen, no getPubAddrs — callee doesn't need them)
    if (!this.sidecarReady) {
      await this.startForDial();
    }

    // Send accept via NKN signaling (no pubAddrs needed — caller already has its own)
    const signal: VoiceCallSignal = {
      callId,
      codec: "opus",
      sampleRate: 48000,
    };

    this.nknClient.sendMessageNoReply(remoteAddress, JSON.stringify({
      id: callId,
      contentType: "voiceCall:accept",
      content: JSON.stringify(signal),
      timestamp: Date.now(),
    }));

    // Dial the caller's TUNA address using their pubAddrs
    if (callerPubAddrs) {
      const callerTunaAddr = `dchat-tuna.${remoteAddress}`;
      console.log(`[VoiceCall] Setting caller pubAddrs for ${callerTunaAddr}`);
      try {
        await this.sendCommand("setPubAddrs", {
          remoteAddr: callerTunaAddr,
          pubAddrs: callerPubAddrs,
        });
      } catch (e) {
        console.error("[VoiceCall] setPubAddrs failed:", e);
      }

      this.dialTuna(callId, remoteAddress);
    } else {
      console.error("[VoiceCall] No caller pubAddrs available — cannot dial");
      this.endCallInternal("no caller pubAddrs");
    }
  }

  /** Decline an incoming call */
  async declineCall(callId: string): Promise<void> {
    if (!this.incomingCall || this.incomingCall.callId !== callId) return;

    const remoteAddress = this.incomingCall.remoteAddress;
    this.incomingCall = null;

    // Send decline via NKN signaling
    this.nknClient.sendMessageNoReply(remoteAddress, JSON.stringify({
      id: callId,
      contentType: "voiceCall:decline",
      content: JSON.stringify({ callId, codec: "opus", sampleRate: 48000 }),
      timestamp: Date.now(),
    }));

    // Reject any associated TUNA session
    // (The TUNA session might not be established yet if the call was declined quickly)
    this.pushToRenderer(IPC.VOICE.ON_INCOMING_CALL, null);
  }

  /** End the active call */
  async endCall(): Promise<void> {
    if (!this.activeCall) return;
    const { callId, remoteAddress, tunaSessionId } = this.activeCall;

    // Send end via NKN signaling
    this.nknClient.sendMessageNoReply(remoteAddress, JSON.stringify({
      id: callId,
      contentType: "voiceCall:end",
      content: JSON.stringify({ callId, codec: "opus", sampleRate: 48000 }),
      timestamp: Date.now(),
    }));

    // Hang up TUNA session
    if (tunaSessionId) {
      this.sendCommand("hangup", { sessionId: tunaSessionId }).catch(console.error);
    }

    this.endCallInternal("local hangup");
  }

  /** Send a video frame to the active call */
  sendVideo(data: ArrayBuffer): void {
    if (!this.activeCall?.tunaSessionId || this.activeCall.state !== "connected") return;
    if (!this.activeCall.isVideoEnabled) return;

    const base64Data = Buffer.from(data).toString("base64");
    this.sendCommandNoWait("sendVideo", {
      sessionId: this.activeCall.tunaSessionId,
      data: base64Data,
    });
  }

  /** Toggle video on/off mid-call and notify remote */
  toggleVideo(enabled: boolean): void {
    if (!this.activeCall) return;
    this.activeCall.isVideoEnabled = enabled;
    if (enabled && this.activeCall.callType === "voice") {
      this.activeCall.callType = "video";
    }
    this.pushCallState();

    // Notify remote peer
    this.nknClient.sendMessageNoReply(this.activeCall.remoteAddress, JSON.stringify({
      id: this.activeCall.callId,
      contentType: "voiceCall:videoToggle",
      content: JSON.stringify({
        callId: this.activeCall.callId,
        codec: "opus",
        sampleRate: 48000,
        callType: this.activeCall.callType,
        videoEnabled: enabled,
      }),
      timestamp: Date.now(),
    }));
  }

  private audioSendCount = 0;
  /** Send an audio frame to the active call */
  sendAudio(data: ArrayBuffer): void {
    if (!this.activeCall?.tunaSessionId || this.activeCall.state !== "connected") {
      if (this.audioSendCount === 0) {
        console.log(`[VoiceCall] sendAudio blocked: tunaSessionId=${this.activeCall?.tunaSessionId}, state=${this.activeCall?.state}`);
      }
      return;
    }

    this.audioSendCount++;
    if (this.audioSendCount <= 5 || this.audioSendCount % 50 === 0) {
      console.log(`[VoiceCall] sendAudio #${this.audioSendCount}, bytes=${data.byteLength}, sessionId=${this.activeCall.tunaSessionId}`);
    }
    const base64Data = Buffer.from(data).toString("base64");
    // Fire-and-forget for audio frames (latency critical)
    this.sendCommandNoWait("sendAudio", {
      sessionId: this.activeCall.tunaSessionId,
      data: base64Data,
    });
  }

  // --- Private methods ---

  private handleIncomingInvite(src: string, signal: VoiceCallSignal): void {
    // If we're already in a call, auto-decline
    if (this.activeCall) {
      this.nknClient.sendMessageNoReply(src, JSON.stringify({
        id: signal.callId,
        contentType: "voiceCall:decline",
        content: JSON.stringify({ callId: signal.callId, codec: "opus", sampleRate: 48000 }),
        timestamp: Date.now(),
      }));
      return;
    }

    // Store caller's TUNA pubAddrs — callee will use them to dial after accepting
    this.incomingCall = {
      callId: signal.callId,
      remoteAddress: src,
      tunaPubAddrs: signal.tunaPubAddrs,
      callType: signal.callType ?? "voice",
    };

    console.log(`[VoiceCall] Incoming invite from ${src.substring(0, 8)}..., tunaPubAddrs=${!!signal.tunaPubAddrs}, callType=${signal.callType ?? "voice"}`);
    this.pushToRenderer(IPC.VOICE.ON_INCOMING_CALL, this.incomingCall);
  }

  private handleRemoteAccept(_src: string, signal: VoiceCallSignal): void {
    if (!this.activeCall || this.activeCall.callId !== signal.callId) return;

    // If TUNA session already arrived (callee's dial beat NKN accept signal), go straight to connected
    if (this.activeCall.tunaSessionId) {
      console.log(`[VoiceCall] Remote accepted — TUNA session already linked, connected`);
      this.activeCall.state = "connected";
      this.activeCall.startedAt = Date.now();
      this.pushCallState();
    } else {
      console.log(`[VoiceCall] Remote accepted — waiting for callee's TUNA dial`);
      this.activeCall.state = "connecting";
      this.pushCallState();
    }
  }

  private async dialTuna(callId: string, targetAddress: string): Promise<void> {
    // The TUNA sidecar uses "dchat-tuna" as its NKN MultiClient identifier,
    // so the remote TUNA listener address is "dchat-tuna.<pubkey>" not bare "<pubkey>"
    const tunaAddress = `dchat-tuna.${targetAddress}`;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!this.activeCall || this.activeCall.callId !== callId) return;

      try {
        console.log(`[VoiceCall] TUNA dial attempt ${attempt}/${maxRetries} to ${tunaAddress}`);
        const result = await this.sendCommand("dial", { remoteAddr: tunaAddress });
        if (this.activeCall?.callId === callId) {
          this.activeCall.tunaSessionId = result.sessionId as string;
          this.activeCall.state = "connected";
          this.activeCall.startedAt = Date.now();
          this.pushCallState();
        }
        return; // success
      } catch (err) {
        console.error(`[VoiceCall] Dial attempt ${attempt} failed:`, err);
        if (attempt < maxRetries && this.activeCall?.callId === callId) {
          // Wait before retry
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    // All retries exhausted
    if (this.activeCall?.callId === callId) {
      this.endCallInternal("dial failed after retries");
    }
  }

  private handleRemoteDecline(_src: string, signal: VoiceCallSignal): void {
    if (!this.activeCall || this.activeCall.callId !== signal.callId) return;
    this.endCallInternal("declined by remote");
  }

  private handleRemoteVideoToggle(_src: string, signal: VoiceCallSignal & { videoEnabled?: boolean }): void {
    if (!this.activeCall || this.activeCall.callId !== signal.callId) return;
    // Remote toggled their video — update our call type to reflect video capability
    if (signal.callType === "video") {
      this.activeCall.callType = "video";
    }
    this.pushCallState();
  }

  private handleRemoteEnd(_src: string, signal: VoiceCallSignal): void {
    if (!this.activeCall || this.activeCall.callId !== signal.callId) return;

    if (this.activeCall.tunaSessionId) {
      this.sendCommand("hangup", { sessionId: this.activeCall.tunaSessionId }).catch(console.error);
    }

    this.endCallInternal("ended by remote");
  }

  private endCallInternal(reason: string): void {
    console.log(`[VoiceCall] Call ended: ${reason}`);
    if (this.activeCall) {
      this.activeCall.state = "ended";
      this.pushCallState();
    }
    this.activeCall = null;
    this.audioSendCount = 0;

    // Stop sidecar so next call starts fresh in the correct mode (caller vs callee)
    this.stop().catch(console.error);
    this.cachedPubAddrs = null;
  }

  private pushCallState(): void {
    if (!this.activeCall) {
      this.pushToRenderer(IPC.VOICE.ON_CALL_STATE, null);
      return;
    }

    const update: VoiceCallStateUpdate = {
      callId: this.activeCall.callId,
      remoteAddress: this.activeCall.remoteAddress,
      state: this.activeCall.state,
      startedAt: this.activeCall.startedAt,
      callType: this.activeCall.callType,
      isVideoEnabled: this.activeCall.isVideoEnabled,
    };

    this.pushToRenderer(IPC.VOICE.ON_CALL_STATE, update);
  }

  private handleSidecarMessage(line: string): void {
    let msg: SidecarResponse;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("[VoiceCall] Invalid sidecar JSON:", line);
      return;
    }

    // Handle responses to pending requests
    if (msg.id !== undefined && msg.id !== 0 && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result ?? {});
      }
      return;
    }

    // Log unmatched responses with errors (e.g. from fire-and-forget commands)
    if (msg.id !== undefined && !msg.event && msg.error) {
      console.error(`[VoiceCall] Unmatched sidecar error (id=${msg.id}): ${msg.error}`);
      return;
    }

    // Handle unsolicited events
    if (msg.event) {
      switch (msg.event) {
        case "incoming":
          console.log(`[VoiceCall] TUNA incoming session=${msg.sessionId} from=${msg.remoteAddr}`);
          if (this.activeCall && !this.activeCall.tunaSessionId) {
            // Call already accepted via NKN signaling — link this TUNA session
            this.activeCall.tunaSessionId = msg.sessionId;
            console.log(`[VoiceCall] Linked TUNA session ${msg.sessionId} to call ${this.activeCall.callId}`);
            if (this.activeCall.state === "ringing" || this.activeCall.state === "connecting") {
              this.activeCall.state = "connected";
              this.activeCall.startedAt = Date.now();
              this.pushCallState();
            }
          } else if (this.activeCall?.tunaSessionId) {
            // Already have a TUNA session for this call, reject the new one
            this.sendCommandNoWait("reject", { sessionId: msg.sessionId });
          }
          // If no activeCall yet, the TUNA session arrived before NKN signaling —
          // store it so acceptCall can use it
          if (!this.activeCall && this.incomingCall) {
            this.pendingTunaSessionId = msg.sessionId ?? null;
          }
          break;

        case "audioData":
          // Forward audio data to renderer
          if (msg.data) {
            this.pushToRenderer(IPC.VOICE.ON_AUDIO_DATA, {
              callId: this.activeCall?.callId,
              data: msg.data,
            });
          }
          break;

        case "videoData":
          // Forward video data to renderer
          if (msg.data) {
            this.pushToRenderer(IPC.VOICE.ON_VIDEO_DATA, {
              callId: this.activeCall?.callId,
              data: msg.data,
            });
          }
          break;

        case "sessionClosed":
          if (this.activeCall?.tunaSessionId === msg.sessionId) {
            this.endCallInternal(msg.reason ?? "session closed");
          }
          break;

        case "error":
          console.error(`[VoiceCall] Sidecar error (session=${msg.sessionId}): ${msg.message}`);
          break;
      }
    }
  }

  private sendCommand(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.sidecar?.stdin?.writable) {
        reject(new Error("Sidecar not running"));
        return;
      }

      const id = ++this.requestId;
      const req: SidecarRequest = { id, method, params };

      this.pendingRequests.set(id, { resolve, reject });

      // init and dial need longer timeouts (NKN connect + TUNA relay discovery)
      const timeoutMs = (method === "init") ? 45000
        : (method === "listen") ? 150000
        : method === "dial" ? 45000
        : 15000;
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Command ${method} timed out`));
        }
      }, timeoutMs);

      // Clear timeout on resolution
      const originalResolve = resolve;
      const originalReject = reject;
      this.pendingRequests.set(id, {
        resolve: (val) => { clearTimeout(timer); originalResolve(val); },
        reject: (err) => { clearTimeout(timer); originalReject(err); },
      });

      try {
        this.sidecar.stdin.write(JSON.stringify(req) + "\n");
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(new Error(`Sidecar write failed: ${err}`));
      }
    });
  }

  private sendCommandNoWait(method: string, params: Record<string, unknown>): void {
    if (!this.sidecar?.stdin?.writable) return;

    // Use id=0 to signal Go sidecar not to send any response
    const req: SidecarRequest = { id: 0, method, params };
    try {
      this.sidecar.stdin.write(JSON.stringify(req) + "\n");
    } catch {
      // Sidecar already exited — silently drop
    }
  }
}
