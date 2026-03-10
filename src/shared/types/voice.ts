export type CallState = "ringing" | "connecting" | "connected" | "ended";

export type CallType = "voice" | "video";

export interface VoiceCallSignal {
  callId: string;
  codec: "opus";
  sampleRate: number;
  tunaPubAddrs?: string; // JSON-encoded TUNA PubAddrs for direct relay connection
  callType?: CallType; // "voice" (default) or "video"
  videoCodec?: "vp8" | "h264"; // Negotiated video codec
}

export interface VoiceCallStateUpdate {
  callId: string;
  remoteAddress: string;
  state: CallState;
  startedAt?: number;
  callType?: CallType;
  isVideoEnabled?: boolean;
}

export interface IncomingCallInfo {
  callId: string;
  remoteAddress: string;
  tunaPubAddrs?: string; // Caller's TUNA pubAddrs for callee to dial
  callType?: CallType;
}
