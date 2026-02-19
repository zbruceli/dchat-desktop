export interface Profile {
  nickname: string;
  avatarPath?: string; // relative path in profile-cache/
  profileVersion: string; // UUID, changes on any update
}
