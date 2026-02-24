export interface DiscoveredGroup {
  topicName: string;
  description?: string;
  category?: string;
  subscriberCount: number;
  reportedBy: string;
  lastReportedAt: number;
  lastVerifiedAt?: number;
  joined?: boolean;
}

export interface DiscoveryBroadcastMessage {
  contentType: "discovery:broadcast";
  groups: { n: string; d?: string; c?: string; s: number }[];
  sender: string;
  timestamp: number;
}
