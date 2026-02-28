import { spawn, type ChildProcess } from "child_process";
import { app } from "electron";
import path from "path";
import crypto from "crypto";
import { EventEmitter } from "events";
import type { NknClientService } from "./nkn-client-service";
import type { CallState, VoiceCallSignal, VoiceCallStateUpdate, IncomingCallInfo } from "../../shared/types";
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
}

const VOICE_CALL_CONTENT_TYPES = new Set([
  "voiceCall:invite",
  "voiceCall:accept",
  "voiceCall:decline",
  "voiceCall:end",
]);

const MIN_BALANCE_NKN = 1;
const MAX_PRICE_PER_MB = "0.001";

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

  async start(): Promise<void> {
    if (this.sidecar) return;

    const binaryName = process.platform === "win32" ? "dchat-tuna.exe" : "dchat-tuna";
    const binaryPath = app.isPackaged
      ? path.join(process.resourcesPath, binaryName)
      : path.join(app.getAppPath(), "dchat-tuna", "bin", binaryName);

    this.sidecar = spawn(binaryPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.sidecar.stdout?.on("data", (chunk: Buffer) => {
      this.lineBuffer += chunk.toString();
      const lines = this.lineBuffer.split("\n");
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

    // Initialize the sidecar with the same NKN seed (same account/pubkey)
    await this.sendCommand("init", {
      seed: this.seed,
      maxPrice: MAX_PRICE_PER_MB,
    });

    // Start listening for incoming TUNA sessions
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
    }
  }

  /** Start an outgoing call */
  async startCall(targetAddress: string): Promise<void> {
    if (this.activeCall) {
      throw new Error("A call is already active");
    }

    if (!this.sidecarReady) {
      await this.start();
    }

    const callId = crypto.randomUUID();

    this.activeCall = {
      callId,
      remoteAddress: targetAddress,
      state: "ringing",
    };

    this.pushCallState();

    // Send invite via NKN signaling (include our TUNA pubAddrs so remote can pre-cache them)
    const signal: VoiceCallSignal = {
      callId,
      codec: "opus",
      sampleRate: 48000,
      tunaPubAddrs: this.cachedPubAddrs ?? undefined,
    };
    console.log(`[VoiceCall] Sending invite with tunaPubAddrs: ${!!signal.tunaPubAddrs}, cachedPubAddrs: ${this.cachedPubAddrs?.substring(0, 50)}`);

    this.nknClient.sendMessageNoReply(targetAddress, JSON.stringify({
      id: callId,
      contentType: "voiceCall:invite",
      content: JSON.stringify(signal),
      timestamp: Date.now(),
    }));

    // Stay in "ringing" state — TUNA dial happens after remote accepts
  }

  /** Accept an incoming call */
  async acceptCall(callId: string): Promise<void> {
    if (!this.incomingCall || this.incomingCall.callId !== callId) {
      throw new Error("No matching incoming call");
    }

    // Ensure sidecar is running and cachedPubAddrs is populated before sending accept
    if (!this.sidecarReady) {
      await this.start();
    }

    const remoteAddress = this.incomingCall.remoteAddress;

    this.activeCall = {
      callId,
      remoteAddress,
      state: "connecting",
    };
    this.incomingCall = null;
    this.pushCallState();

    // Send accept via NKN signaling (include our TUNA pubAddrs so caller can pre-cache them)
    const signal: VoiceCallSignal = {
      callId,
      codec: "opus",
      sampleRate: 48000,
      tunaPubAddrs: this.cachedPubAddrs ?? undefined,
    };

    this.nknClient.sendMessageNoReply(remoteAddress, JSON.stringify({
      id: callId,
      contentType: "voiceCall:accept",
      content: JSON.stringify(signal),
      timestamp: Date.now(),
    }));

    // Link pending TUNA session if it arrived before accept
    if (this.pendingTunaSessionId) {
      this.activeCall.tunaSessionId = this.pendingTunaSessionId;
      this.pendingTunaSessionId = null;
      console.log(`[VoiceCall] Linked pending TUNA session to call ${callId}`);
    }

    // Mark connected if we already have a TUNA session, otherwise wait for "incoming" event
    if (this.activeCall.tunaSessionId) {
      this.activeCall.state = "connected";
      this.activeCall.startedAt = Date.now();
      this.pushCallState();
    } else {
      console.log("[VoiceCall] Waiting for TUNA session from caller...");
      // Will transition to "connected" when "incoming" TUNA event arrives
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

    // Pre-cache caller's TUNA pubAddrs so our sidecar can dial them without Go-to-Go NKN messaging
    if (signal.tunaPubAddrs) {
      const callerTunaAddr = `dchat-tuna.${src}`;
      console.log(`[VoiceCall] Pre-caching caller pubAddrs for ${callerTunaAddr}`);
      this.sendCommand("setPubAddrs", {
        remoteAddr: callerTunaAddr,
        pubAddrs: signal.tunaPubAddrs,
      }).catch(e => console.error("[VoiceCall] setPubAddrs failed:", e));
    }

    this.incomingCall = {
      callId: signal.callId,
      remoteAddress: src,
    };

    this.pushToRenderer(IPC.VOICE.ON_INCOMING_CALL, this.incomingCall);
  }

  private async handleRemoteAccept(_src: string, signal: VoiceCallSignal): Promise<void> {
    if (!this.activeCall || this.activeCall.callId !== signal.callId) return;

    console.log(`[VoiceCall] Remote accepted call. tunaPubAddrs present: ${!!signal.tunaPubAddrs}`);
    if (signal.tunaPubAddrs) {
      console.log(`[VoiceCall] Callee pubAddrs: ${signal.tunaPubAddrs}`);
    }

    const callId = this.activeCall.callId;
    const targetAddress = this.activeCall.remoteAddress;

    // Remote accepted — now dial TUNA for the data channel
    this.activeCall.state = "connecting";
    this.pushCallState();

    // Pre-cache callee's TUNA pubAddrs so DialWithConfig skips broken Go-to-Go NKN messaging
    if (signal.tunaPubAddrs) {
      const calleeTunaAddr = `dchat-tuna.${targetAddress}`;
      console.log(`[VoiceCall] Pre-caching callee pubAddrs for ${calleeTunaAddr}`);
      try {
        await this.sendCommand("setPubAddrs", {
          remoteAddr: calleeTunaAddr,
          pubAddrs: signal.tunaPubAddrs,
        });
      } catch (e) {
        console.error("[VoiceCall] setPubAddrs failed:", e);
      }
    }

    this.dialTuna(callId, targetAddress);
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
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result ?? {});
      }
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
            if (this.activeCall.state === "connecting") {
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

      this.sidecar.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  private sendCommandNoWait(method: string, params: Record<string, unknown>): void {
    if (!this.sidecar?.stdin?.writable) return;

    const id = ++this.requestId;
    const req: SidecarRequest = { id, method, params };
    this.sidecar.stdin.write(JSON.stringify(req) + "\n");
    // Don't track response — fire and forget
  }
}
