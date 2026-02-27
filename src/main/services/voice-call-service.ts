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
  private seed: string;
  private sidecarReady = false;
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

    // Initialize the sidecar with NKN seed
    await this.sendCommand("init", {
      seed: this.seed,
      maxPrice: MAX_PRICE_PER_MB,
    });

    // Start listening for incoming TUNA sessions
    await this.sendCommand("listen", {});
    this.sidecarReady = true;
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

    // Send invite via NKN signaling
    const signal: VoiceCallSignal = {
      callId,
      codec: "opus",
      sampleRate: 48000,
    };

    this.nknClient.sendMessageNoReply(targetAddress, JSON.stringify({
      id: callId,
      contentType: "voiceCall:invite",
      content: JSON.stringify(signal),
      timestamp: Date.now(),
    }));

    // Dial via TUNA sidecar (async, may take a few seconds)
    this.activeCall.state = "connecting";
    this.pushCallState();

    try {
      const result = await this.sendCommand("dial", { remoteAddr: targetAddress });
      if (this.activeCall?.callId === callId) {
        this.activeCall.tunaSessionId = result.sessionId as string;
        this.activeCall.state = "connected";
        this.activeCall.startedAt = Date.now();
        this.pushCallState();
      }
    } catch (err) {
      console.error("[VoiceCall] Dial failed:", err);
      this.endCallInternal("dial failed");
    }
  }

  /** Accept an incoming call */
  async acceptCall(callId: string): Promise<void> {
    if (!this.incomingCall || this.incomingCall.callId !== callId) {
      throw new Error("No matching incoming call");
    }

    const remoteAddress = this.incomingCall.remoteAddress;

    this.activeCall = {
      callId,
      remoteAddress,
      state: "connecting",
    };
    this.incomingCall = null;
    this.pushCallState();

    // Send accept via NKN signaling
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

    // The TUNA session was already accepted at transport level when the incoming event arrived
    // Find the TUNA session for this remote address
    // The sidecar already has the session from the "incoming" event
    if (this.activeCall) {
      this.activeCall.state = "connected";
      this.activeCall.startedAt = Date.now();
      this.pushCallState();
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

  /** Send an audio frame to the active call */
  sendAudio(data: ArrayBuffer): void {
    if (!this.activeCall?.tunaSessionId || this.activeCall.state !== "connected") return;

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

    this.incomingCall = {
      callId: signal.callId,
      remoteAddress: src,
    };

    this.pushToRenderer(IPC.VOICE.ON_INCOMING_CALL, this.incomingCall);
  }

  private handleRemoteAccept(_src: string, signal: VoiceCallSignal): void {
    if (!this.activeCall || this.activeCall.callId !== signal.callId) return;
    // Call is already being connected via TUNA dial
    // The state transition happens when dial succeeds
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
          // TUNA session incoming — store sessionId for later accept
          // The actual call invite comes via NKN signaling
          if (this.incomingCall && this.activeCall) {
            // Already have an active call, reject this TUNA session
            this.sendCommandNoWait("reject", { sessionId: msg.sessionId });
          }
          // Store the TUNA session ID so we can associate it with the NKN signaling invite
          if (this.incomingCall) {
            // Will be assigned when acceptCall is called
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

      // Timeout after 15s
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Command ${method} timed out`));
        }
      }, 15000);

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
