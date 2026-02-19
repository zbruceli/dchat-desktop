import fs from "fs";
import path from "path";
import sharp from "sharp";
import { randomUUID } from "crypto";
import type { Database } from "better-sqlite3";
import type { Profile } from "../../shared/types/profile";

const AVATAR_SIZE = 200;
const AVATAR_QUALITY = 80;

export class ProfileService {
  private cacheDir: string;

  constructor(
    private db: Database,
    userDataPath: string,
    private pushToRenderer: (channel: string, data: unknown) => void,
  ) {
    this.cacheDir = path.join(userDataPath, "profile-cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getProfile(): Profile {
    const nickname = this.readSetting("profile_nickname") ?? "";
    const avatarPath = this.readSetting("profile_avatar_path") ?? undefined;
    let profileVersion = this.readSetting("profile_version");
    if (!profileVersion) {
      profileVersion = randomUUID();
      this.writeSetting("profile_version", profileVersion);
    }
    return { nickname, avatarPath, profileVersion };
  }

  setNickname(nickname: string): Profile {
    this.writeSetting("profile_nickname", nickname);
    const newVersion = randomUUID();
    this.writeSetting("profile_version", newVersion);
    const profile = this.getProfile();
    this.pushToRenderer("profile:onUpdate", profile);
    return profile;
  }

  async setAvatar(filePath: string): Promise<Profile> {
    const imageBuffer = fs.readFileSync(filePath);
    const resized = await sharp(imageBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .jpeg({ quality: AVATAR_QUALITY })
      .toBuffer();

    const avatarFile = "avatar.jpg";
    const avatarFullPath = path.join(this.cacheDir, avatarFile);
    fs.writeFileSync(avatarFullPath, resized);

    this.writeSetting("profile_avatar_path", avatarFile);
    const newVersion = randomUUID();
    this.writeSetting("profile_version", newVersion);
    const profile = this.getProfile();
    this.pushToRenderer("profile:onUpdate", profile);
    return profile;
  }

  private readSetting(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string | null } | undefined;
    if (!row || row.value === null) return undefined;
    try {
      return JSON.parse(row.value) as string;
    } catch {
      return row.value;
    }
  }

  private writeSetting(key: string, value: string): void {
    const serialized = JSON.stringify(value);
    this.db
      .prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, serialized);
  }
}
