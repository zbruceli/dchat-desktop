export type CallState = "ringing" | "connecting" | "connected" | "ended";

export interface VoiceCallSignal {
  callId: string;
  codec: "opus";
  sampleRate: number;
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
}
