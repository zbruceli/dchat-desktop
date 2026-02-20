export const PrivateGroupItemPerm = {
  BLACK: -20,
  QUIT: -10,
  NONE: 0,
  NORMAL: 10,
  ADMIN: 20,
  OWNER: 30,
} as const;

export type PrivateGroupPermission =
  (typeof PrivateGroupItemPerm)[keyof typeof PrivateGroupItemPerm];

export interface PrivateGroup {
  groupId: string;
  type: number; // 0 = normal
  name: string;
  count: number;
  joined: boolean;
  signature: string;
  version: string;
  data: string; // JSON string of group raw data
  createdAt: number;
  updatedAt: number;
}

export interface PrivateGroupMember {
  groupId: string;
  permission: PrivateGroupPermission;
  expiresAt: number;
  inviter: string; // NKN address of inviter
  invitee: string; // NKN address of invitee
  inviterRawData: string;
  inviteeRawData: string;
  inviterSignature: string;
  inviteeSignature: string;
}
