import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import type { NknClientService } from "./nkn-client-service";
import type { ProfileService } from "./profile-service";
import type { ContactRepository } from "../db/repositories/contact-repository";
import type { SessionRepository } from "../db/repositories/session-repository";
import type { MessageData } from "../../shared/types";

const PROFILE_RESPONSE_THROTTLE_MS = 30_000; // 30 seconds
const AVATAR_SIZE = 200;
const AVATAR_QUALITY = 80;

export class ContactProfileService {
  private cacheDir: string;
  /** Tracks last profile response timestamp per sender address. */
  private lastResponseAt = new Map<string, number>();

  constructor(
    private nknClient: NknClientService,
    private profileService: ProfileService,
    private contactRepo: ContactRepository,
    private sessionRepo: SessionRepository,
    private pushToRenderer: (channel: string, data: unknown) => void,
    userDataPath: string,
  ) {
    this.cacheDir = path.join(userDataPath, "contact-cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getMyProfileVersion(): string {
    return this.profileService.getProfile().profileVersion;
  }

  /**
   * Called after receiving any displayable direct message.
   * Compares sender's profileVersion against stored contact version.
   * If different, sends a profile request.
   */
  checkAndRequestProfile(senderAddress: string, messageData: MessageData): void {
    const remoteVersion = messageData.options?.profileVersion;
    if (!remoteVersion) return;

    const contact = this.contactRepo.findByAddress(senderAddress);
    if (!contact) return; // only for known contacts

    if (contact.profileVersion === remoteVersion) return; // already up to date

    this.sendProfileRequest(senderAddress, contact.profileVersion);
  }

  /**
   * Routes incoming contentType "contact" messages to request or response handler.
   */
  handleContactMessage(src: string, messageData: MessageData): void {
    let data: Record<string, unknown>;
    try {
      // Content may be a JSON string or already parsed object
      data =
        typeof messageData.content === "string" && messageData.content
          ? JSON.parse(messageData.content)
          : (messageData.content as unknown as Record<string, unknown>) ?? {};
    } catch {
      return;
    }

    const requestType = data.requestType as string | undefined;
    const responseType = data.responseType as string | undefined;

    if (requestType) {
      this.handleProfileRequest(src, requestType);
    } else if (responseType) {
      const version = data.version as string | undefined;
      const content = data.content as Record<string, unknown> | undefined;
      this.handleProfileResponse(src, version, responseType, content);
    }
  }

  private sendProfileRequest(target: string, storedVersion?: string): void {
    const data: Record<string, unknown> = {
      id: crypto.randomUUID(),
      contentType: "contact",
      timestamp: Date.now(),
      requestType: "full",
      version: storedVersion ?? "",
    };

    try {
      this.nknClient.sendMessageNoReply(target, JSON.stringify(data));
      console.log(
        `[ContactProfile] Sent profile request to ${target.substring(0, 8)}...`,
      );
    } catch (err) {
      console.error("[ContactProfile] Failed to send profile request:", err);
    }
  }

  private handleProfileRequest(sender: string, requestType: string): void {
    // Only respond to known contacts
    const contact = this.contactRepo.findByAddress(sender);
    if (!contact) return;

    // Throttle: max one response per sender per 30s
    const now = Date.now();
    const lastAt = this.lastResponseAt.get(sender) ?? 0;
    if (now - lastAt < PROFILE_RESPONSE_THROTTLE_MS) {
      console.log(
        `[ContactProfile] Throttled response to ${sender.substring(0, 8)}... (${now - lastAt}ms < ${PROFILE_RESPONSE_THROTTLE_MS}ms)`,
      );
      return;
    }

    if (requestType === "header") {
      this.sendProfileResponseHeader(sender);
    } else {
      this.sendProfileResponseFull(sender);
    }

    this.lastResponseAt.set(sender, now);
  }

  private sendProfileResponseHeader(target: string): void {
    const version = this.getMyProfileVersion();
    const data: Record<string, unknown> = {
      id: crypto.randomUUID(),
      contentType: "contact",
      timestamp: Date.now(),
      responseType: "header",
      version,
    };

    try {
      this.nknClient.sendMessageNoReply(target, JSON.stringify(data));
    } catch (err) {
      console.error("[ContactProfile] Failed to send header response:", err);
    }
  }

  private async sendProfileResponseFull(target: string): Promise<void> {
    const profile = this.profileService.getProfile();
    const content: Record<string, unknown> = {
      name: profile.nickname || "",
      first_name: profile.nickname || "",
    };

    // Encode avatar as base64 if available
    if (profile.avatarPath) {
      try {
        const avatarFullPath = profile.avatarPath.includes(path.sep)
          ? profile.avatarPath
          : path.join(
              path.dirname(this.cacheDir),
              "profile-cache",
              profile.avatarPath,
            );
        if (fs.existsSync(avatarFullPath)) {
          const avatarBuffer = fs.readFileSync(avatarFullPath);
          const base64 = avatarBuffer.toString("base64");
          content.avatar = {
            type: "base64",
            data: base64,
            ext: "jpg",
          };
        }
      } catch (err) {
        console.error("[ContactProfile] Failed to read avatar for response:", err);
      }
    }

    const data: Record<string, unknown> = {
      id: crypto.randomUUID(),
      contentType: "contact",
      timestamp: Date.now(),
      responseType: "full",
      version: profile.profileVersion,
      content,
    };

    try {
      this.nknClient.sendMessageNoReply(target, JSON.stringify(data));
      console.log(
        `[ContactProfile] Sent full profile response to ${target.substring(0, 8)}...`,
      );
    } catch (err) {
      console.error("[ContactProfile] Failed to send full response:", err);
    }
  }

  private async handleProfileResponse(
    sender: string,
    version: string | undefined,
    responseType: string,
    content: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!version) return;

    const contact = this.contactRepo.findByAddress(sender);
    if (!contact) return;

    // Already up to date
    if (contact.profileVersion === version) return;

    if (responseType !== "full" || !content) {
      // Got header-only response — request full profile
      this.sendProfileRequest(sender, contact.profileVersion);
      return;
    }

    // Extract name
    const firstName =
      (content.first_name as string) || (content.name as string) || "";
    const displayName = firstName || contact.name;

    // Extract and save avatar
    let avatarUri: string | null = contact.avatarUri ?? null;
    const avatarObj = content.avatar as
      | { type?: string; data?: string; ext?: string }
      | undefined;
    if (avatarObj?.type === "base64" && avatarObj.data) {
      try {
        let base64Data = avatarObj.data;
        // Strip data-URI prefix if present
        if (base64Data.includes(",")) {
          base64Data = base64Data.split(",")[1];
        }
        const fileExt = avatarObj.ext || "jpg";
        const avatarBuffer = Buffer.from(base64Data, "base64");

        // Resize to 200x200 JPEG (same as own profile avatar)
        const resized = await sharp(avatarBuffer)
          .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
          .jpeg({ quality: AVATAR_QUALITY })
          .toBuffer();

        const hash = crypto
          .createHash("sha1")
          .update(sender)
          .digest("hex")
          .substring(0, 12);
        const fileName = `${hash}.${fileExt}`;
        const filePath = path.join(this.cacheDir, fileName);
        fs.writeFileSync(filePath, resized);

        avatarUri = fileName;
      } catch (err) {
        console.error("[ContactProfile] Failed to save avatar:", err);
      }
    }

    // Update contact in DB
    this.contactRepo.updateProfile(sender, displayName, avatarUri, version);

    // Update session target name
    const sessionId = `direct:${sender}`;
    const session = this.sessionRepo.findById(sessionId);
    if (session) {
      this.sessionRepo.updateTargetName(sessionId, displayName);
      this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));
    }

    // Push contact update to renderer
    const updatedContact = this.contactRepo.findByAddress(sender);
    if (updatedContact) {
      this.pushToRenderer("contact:onUpdate", updatedContact);
    }

    console.log(
      `[ContactProfile] Updated profile for ${sender.substring(0, 8)}...: name="${displayName}", avatar=${avatarUri ? "yes" : "no"}, version=${version}`,
    );
  }
}
