export type SessionType = "direct" | "topic" | "privateGroup";

export interface Session {
  id: string;
  type: SessionType;
  targetAddress: string;
  targetName: string;
  lastMessageContent: string;
  lastMessageAt: number;
  unreadCount: number;
  muted: boolean;
  createdAt: number;
  updatedAt: number;
}
