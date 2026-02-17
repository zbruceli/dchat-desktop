export interface Topic {
  id: string; // topicName (PK)
  joined: boolean;
  subscribeAt?: number;
  expireBlockHeight?: number;
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface TopicSubscriber {
  topicId: string;
  contactAddress: string;
  createdAt: number;
}
