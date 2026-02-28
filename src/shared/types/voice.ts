export type CallState = "ringing" | "connecting" | "connected" | "ended";

export interface VoiceCallSignal {
  callId: string;
  codec: "opus";
  sampleRate: number;
  tunaPubAddrs?: string; // JSON-encoded TUNA PubAddrs for direct relay connection
}

export interface VoiceCallStateUpdate {
  callId: string;
  remoteAddress: string;
  state: CallState;
  startedAt?: number;
}

export interface IncomingCallInfo {
  callId: string;
  remoteAddress: string;
  tunaPubAddrs?: string; // Caller's TUNA pubAddrs for callee to dial
}
