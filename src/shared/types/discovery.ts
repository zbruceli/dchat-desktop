export interface DiscoveredGroup {
  topicName: string;
  description?: string;
  category?: string;
  subscriberCount: number;
  reportedBy: string;
  lastReportedAt: number;
  lastVerifiedAt?: number;
  avatarUri?: string;
  joined?: boolean;
}

export interface DiscoveryBroadcastMessage {
  contentType: "discovery:broadcast";
  groups: { n: string; d?: string; c?: string; s: number }[];
  sender: string;
  timestamp: number;
}

// nMobile 2026 announcement format
export interface AnnouncementMessage {
  type: "announcement" | "periodic";
  version: string;
  timestamp: string; // ISO 8601
  sender: string;
  payload: {
    groups: AnnouncementGroup[];
  };
}

export interface AnnouncementGroup {
  topicId: string;
  name: string;
  description?: string;
  category?: string;
  subscriberCount: number;
  avatar?: { type: "base64"; data: string; ext: string };
  metadata?: Record<string, unknown>;
}
