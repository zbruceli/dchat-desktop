import crypto from "crypto";
import type { NknClientService } from "./nkn-client-service";
import type { ImageService } from "./image-service";
import type { AudioService } from "./audio-service";
import type { FileService } from "./file-service";
import type { PrivateGroupRepository } from "../db/repositories/private-group-repository";
import type { PrivateGroupMemberRepository } from "../db/repositories/private-group-member-repository";
import type { MessageRepository } from "../db/repositories/message-repository";
import type { SessionRepository } from "../db/repositories/session-repository";
import type { ContactRepository } from "../db/repositories/contact-repository";
import type {
  PrivateGroup,
  PrivateGroupMember,
  Message,
  MessageData,
  MessageContentType,
  MessageOptions,
} from "../../shared/types";
import { PrivateGroupItemPerm } from "../../shared/types";
import {
  getPubKeyFromAddress,
  genSignature,
  verifySignature,
  buildMemberRawData,
  buildGroupRawData,
  genGroupVersion,
} from "../crypto/ed25519-signature";

// nMobile uses 7 days for invitation expiry
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const PRIVATE_GROUP_CONTROL_TYPES = new Set([
  "privateGroup:invitation",
  "privateGroup:accept",
  "privateGroup:subscribe",
  "privateGroup:quit",
  "privateGroup:optionRequest",
  "privateGroup:optionResponse",
  "privateGroup:memberRequest",
  "privateGroup:memberResponse",
]);

// Content types that represent user-visible messages
const DISPLAYABLE_TYPES = new Set([
  "text",
  "textExtension",
  "image",
  "audio",
  "video",
  "file",
  "ipfs",
]);

export { PRIVATE_GROUP_CONTROL_TYPES };

export class PrivateGroupService {
  private imageService: ImageService | null = null;
  private audioService: AudioService | null = null;
  private fileService: FileService | null = null;
  private onNotification: ((title: string, body: string, sessionId: string) => void) | null = null;

  constructor(
    private nknClient: NknClientService,
    private groupRepo: PrivateGroupRepository,
    private memberRepo: PrivateGroupMemberRepository,
    private messageRepo: MessageRepository,
    private sessionRepo: SessionRepository,
    private contactRepo: ContactRepository,
    private pushToRenderer: (channel: string, data: unknown) => void,
  ) {}

  setNotificationCallback(cb: (title: string, body: string, sessionId: string) => void): void {
    this.onNotification = cb;
  }

  setImageService(imageService: ImageService): void {
    this.imageService = imageService;
  }

  setAudioService(audioService: AudioService): void {
    this.audioService = audioService;
  }

  setFileService(fileService: FileService): void {
    this.fileService = fileService;
  }

  // ─── Group Lifecycle ────────────────────────────────────

  async createGroup(name: string): Promise<PrivateGroup> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const keyPair = this.nknClient.getKeyPair();
    // keyPair.publicKey is Uint8Array — use hex address instead
    const pubKeyHex = this.nknClient.getPublicKey();

    // Group ID: {ownerPublicKeyHex}.{uuidNoHyphens}
    const uuid = crypto.randomUUID().replace(/-/g, "");
    const groupId = `${pubKeyHex}.${uuid}`;

    const now = Date.now();

    // Build and sign group raw data
    const groupRawData = buildGroupRawData({
      deleteAfterSeconds: 0,
      groupId,
      name,
      type: 0,
    });
    const groupSignature = await genSignature(keyPair.privateKey, groupRawData);

    // Create owner member entry (self-invited) — nMobile uses expiresAt = now + 7 days even for owner
    const ownerExpiresAt = now + INVITATION_EXPIRY_MS;
    const memberRawData = buildMemberRawData({
      expiresAt: ownerExpiresAt,
      groupId,
      invitee: myAddress,
      inviter: myAddress,
      permission: PrivateGroupItemPerm.OWNER,
    });
    const memberSignature = await genSignature(keyPair.privateKey, memberRawData);

    const ownerMember: PrivateGroupMember = {
      groupId,
      permission: PrivateGroupItemPerm.OWNER,
      expiresAt: ownerExpiresAt,
      inviter: myAddress,
      invitee: myAddress,
      inviterRawData: memberRawData,
      inviteeRawData: memberRawData,
      inviterSignature: memberSignature,
      inviteeSignature: memberSignature,
    };

    // Compute initial version
    const version = genGroupVersion(1, groupSignature, [ownerMember]);

    const group: PrivateGroup = {
      groupId,
      type: 0,
      name,
      count: 1,
      joined: true,
      signature: groupSignature,
      version,
      data: groupRawData,
      createdAt: now,
      updatedAt: now,
    };

    this.groupRepo.upsert(group);
    this.memberRepo.upsert(ownerMember);
    this.getOrCreateGroupSession(groupId, name);

    this.pushToRenderer("privateGroup:onUpdate", group);
    return group;
  }

  async invite(groupId: string, targetAddress: string): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const group = this.groupRepo.findById(groupId);
    if (!group) throw new Error("Group not found");

    // Verify I have permission to invite (owner or admin)
    const myMember = this.memberRepo.findByGroupIdAndInvitee(groupId, myAddress);
    if (!myMember || myMember.permission < PrivateGroupItemPerm.ADMIN) {
      throw new Error("No permission to invite members");
    }

    // Check target isn't already an active member
    const existing = this.memberRepo.findByGroupIdAndInvitee(groupId, targetAddress);
    if (existing && existing.permission > PrivateGroupItemPerm.NONE) {
      throw new Error("Already a member");
    }

    const keyPair = this.nknClient.getKeyPair();
    const now = Date.now();
    const expiresAt = now + INVITATION_EXPIRY_MS;

    // Build inviter-signed member raw data
    const rawData = buildMemberRawData({
      expiresAt,
      groupId,
      invitee: targetAddress,
      inviter: myAddress,
      permission: PrivateGroupItemPerm.NORMAL,
    });
    const inviterSignature = await genSignature(keyPair.privateKey, rawData);

    // Send invitation message — nMobile wire format: content is an object, no groupId in outer envelope
    const messageData = {
      id: crypto.randomUUID(),
      contentType: "privateGroup:invitation",
      content: {
        groupId,
        name: group.name,
        type: group.type,
        version: group.version,
        item: {
          groupId,
          permission: PrivateGroupItemPerm.NORMAL,
          expiresAt,
          invitee: targetAddress,
          inviter: myAddress,
          inviterRawData: rawData,
          inviterSignature,
        },
      },
      timestamp: now,
    };

    this.nknClient.sendMessageNoReply(targetAddress, JSON.stringify(messageData));

    // Insert outbound invitation message so sender can see what they sent
    const sessionId = `privateGroup:${groupId}`;
    this.getOrCreateGroupSession(groupId, group.name);

    const inviteMsg: Message = {
      id: crypto.randomUUID(),
      sessionId,
      sender: myAddress,
      receiver: targetAddress,
      contentType: "privateGroup:invitation",
      content: JSON.stringify({
        groupId,
        name: group.name,
        inviter: myAddress,
        invitee: targetAddress,
      }),
      status: "sent",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };
    this.messageRepo.insert(inviteMsg);
    this.sessionRepo.updateLastMessage(sessionId, `Invited ${targetAddress.substring(0, 8)}...`, now);
    this.pushToRenderer("chat:onMessage", inviteMsg);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    console.log(`[PrivateGroupService] Sent invitation to ${targetAddress} for group "${group.name}"`);
  }

  async handleIncomingControlMessage(src: string, messageData: MessageData): Promise<void> {
    const contentType = messageData.contentType;
    console.log(`[PrivateGroupService] handleIncomingControlMessage: contentType=${contentType}, src=${src.substring(0, 16)}...`);

    switch (contentType) {
      case "privateGroup:invitation":
        await this.onInvitationReceived(src, messageData);
        break;
      case "privateGroup:accept":
        await this.onInviteeAccept(src, messageData);
        break;
      case "privateGroup:subscribe":
        this.onMemberSubscribe(src, messageData);
        break;
      case "privateGroup:quit":
        await this.onMemberQuit(src, messageData);
        break;
      case "privateGroup:memberResponse":
        this.onMemberResponse(src, messageData);
        break;
      case "privateGroup:memberRequest":
        this.onMemberRequest(src, messageData);
        break;
      case "privateGroup:optionRequest":
        this.onOptionRequest(src, messageData);
        break;
      case "privateGroup:optionResponse":
        this.onOptionResponse(src, messageData);
        break;
      default:
        break;
    }
  }

  private async onInvitationReceived(src: string, messageData: MessageData): Promise<void> {
    console.log(`[PrivateGroupService] onInvitationReceived from ${src.substring(0, 16)}...`);
    if (!messageData.content) {
      console.warn("[PrivateGroupService] No content in invitation message");
      return;
    }

    // Content is already normalized to JSON string by ChatService
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: any;
    try {
      raw = JSON.parse(messageData.content!);
    } catch (e) {
      console.error("[PrivateGroupService] Failed to parse invitation content:", e);
      return;
    }

    // nMobile format: { groupId, name, type, version, item: { groupId, permission, expiresAt, invitee, inviter, inviterRawData, inviterSignature } }
    // Normalize to flat fields
    const item = raw.item ?? {};
    const groupId: string = raw.groupId || item.groupId || "";
    const groupName: string = raw.name || raw.groupName || "";
    const groupType: number = raw.type ?? 0;
    const groupVersion: string = raw.version || "";
    const inviter: string = item.inviter || raw.inviter || src;
    const invitee: string = item.invitee || raw.invitee || "";
    const inviterRawData: string = item.inviterRawData || raw.inviterRawData || "";
    const inviterSignature: string = item.inviterSignature || raw.inviterSignature || "";
    const permission: number = item.permission ?? raw.permission ?? PrivateGroupItemPerm.NORMAL;
    const expiresAt: number = item.expiresAt ?? raw.expiresAt ?? 0;

    if (!groupId) {
      console.warn("[PrivateGroupService] No groupId in invitation");
      return;
    }

    console.log(`[PrivateGroupService] Invitation for group "${groupName}" (${groupId.substring(0, 20)}...)`);

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) {
      console.warn("[PrivateGroupService] Not connected, ignoring invitation");
      return;
    }

    // Verify this invitation is for us
    if (invitee !== myAddress) {
      console.warn(`[PrivateGroupService] Invitation not for us: invitee=${invitee.substring(0, 16)}... myAddress=${myAddress.substring(0, 16)}...`);
      return;
    }

    // Verify inviter signature
    const inviterPubKey = getPubKeyFromAddress(inviter);
    console.log(`[PrivateGroupService] Verifying inviter signature: pubKey=${inviterPubKey.substring(0, 16)}...`);
    const valid = await verifySignature(inviterPubKey, inviterRawData, inviterSignature);
    if (!valid) {
      console.warn("[PrivateGroupService] Invalid inviter signature, ignoring invitation");
      return;
    }
    console.log(`[PrivateGroupService] Signature verified OK, creating session and message`);

    // Store invitation as a message in a session so UI can show Accept button
    const sessionId = `privateGroup:${groupId}`;
    this.getOrCreateGroupSession(groupId, groupName);

    // Normalize content to JSON string for DB storage
    const contentStr = typeof messageData.content === "string"
      ? messageData.content
      : JSON.stringify(messageData.content);

    const now = Date.now();
    const message: Message = {
      id: messageData.id,
      sessionId,
      sender: src,
      receiver: myAddress,
      contentType: "privateGroup:invitation",
      content: contentStr,
      status: "delivered",
      isOutbound: false,
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    // Dedup
    if (this.messageRepo.findById(messageData.id)) return;

    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(sessionId, "Invited you to join", messageData.timestamp ?? now);
    this.sessionRepo.incrementUnread(sessionId);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    // Store the group metadata (not yet joined)
    const existing = this.groupRepo.findById(groupId);
    if (!existing) {
      const group: PrivateGroup = {
        groupId,
        type: groupType,
        name: groupName,
        count: 0,
        joined: false,
        signature: "",
        version: groupVersion,
        data: "",
        createdAt: now,
        updatedAt: now,
      };
      this.groupRepo.upsert(group);
      this.pushToRenderer("privateGroup:onUpdate", group);
    }

    // Store invitation member entry (not yet accepted)
    // Preserve expiresAt from invitation — nMobile checks this on accept
    const member: PrivateGroupMember = {
      groupId,
      permission: PrivateGroupItemPerm.NONE, // not yet accepted
      expiresAt,
      inviter,
      invitee,
      inviterRawData,
      inviteeRawData: "",
      inviterSignature,
      inviteeSignature: "",
    };
    this.memberRepo.upsert(member);
  }

  async acceptInvitation(groupId: string): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const myMember = this.memberRepo.findByGroupIdAndInvitee(groupId, myAddress);
    if (!myMember) throw new Error("No invitation found");

    // Verify inviter signature
    const inviterPubKey = getPubKeyFromAddress(myMember.inviter);
    const valid = await verifySignature(inviterPubKey, myMember.inviterRawData, myMember.inviterSignature);
    if (!valid) throw new Error("Invalid inviter signature");

    const keyPair = this.nknClient.getKeyPair();

    // Use the same expiresAt from the invitation — it's part of the signed raw data
    const expiresAt = myMember.expiresAt;

    // Sign as invitee (must use same expiresAt as inviter's raw data)
    const rawData = buildMemberRawData({
      expiresAt,
      groupId,
      invitee: myAddress,
      inviter: myMember.inviter,
      permission: PrivateGroupItemPerm.NORMAL,
    });
    const inviteeSignature = await genSignature(keyPair.privateKey, rawData);

    // Update member with invitee signature and set permission to NORMAL
    const updatedMember: PrivateGroupMember = {
      ...myMember,
      permission: PrivateGroupItemPerm.NORMAL,
      inviteeRawData: rawData,
      inviteeSignature,
    };
    this.memberRepo.upsert(updatedMember);

    // Mark group as joined
    this.groupRepo.setJoined(groupId, true);

    // Send accept message to inviter — nMobile format: content is object, no groupId in outer envelope
    const now = Date.now();
    const messageData = {
      id: crypto.randomUUID(),
      contentType: "privateGroup:accept",
      content: {
        groupId,
        permission: PrivateGroupItemPerm.NORMAL,
        expiresAt,
        inviter: myMember.inviter,
        invitee: myAddress,
        inviterRawData: myMember.inviterRawData,
        inviteeRawData: rawData,
        inviterSignature: myMember.inviterSignature,
        inviteeSignature,
      },
      timestamp: now,
    };

    this.nknClient.sendMessageNoReply(myMember.inviter, JSON.stringify(messageData));

    // Insert a subscribe notification in the session
    const sessionId = `privateGroup:${groupId}`;
    const subscribeMsg: Message = {
      id: crypto.randomUUID(),
      sessionId,
      sender: myAddress,
      receiver: groupId,
      contentType: "privateGroup:subscribe",
      content: "Joined the group",
      status: "sent",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };
    this.messageRepo.insert(subscribeMsg);
    this.sessionRepo.updateLastMessage(sessionId, "Joined the group", now);
    this.pushToRenderer("chat:onMessage", subscribeMsg);

    // Push updated group
    const group = this.groupRepo.findById(groupId);
    if (group) {
      this.pushToRenderer("privateGroup:onUpdate", group);
    }
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    // Request full member list from inviter — nMobile format
    const memberRequestData = {
      id: crypto.randomUUID(),
      contentType: "privateGroup:memberRequest",
      content: { groupId, version: group?.version ?? "" },
      timestamp: now,
    };
    this.nknClient.sendMessageNoReply(myMember.inviter, JSON.stringify(memberRequestData));

    console.log(`[PrivateGroupService] Accepted invitation for group ${groupId}`);
  }

  private async onInviteeAccept(src: string, messageData: MessageData): Promise<void> {
    if (!messageData.content) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try {
      payload = JSON.parse(messageData.content);
    } catch {
      return;
    }

    // Verify both signatures
    const inviterPubKey = getPubKeyFromAddress(payload.inviter);
    const inviteeValid = await verifySignature(
      getPubKeyFromAddress(payload.invitee),
      payload.inviteeRawData,
      payload.inviteeSignature,
    );
    const inviterValid = await verifySignature(inviterPubKey, payload.inviterRawData, payload.inviterSignature);

    if (!inviterValid || !inviteeValid) {
      console.warn("[PrivateGroupService] Invalid signatures in accept message");
      return;
    }

    const groupId = payload.groupId;

    // Add/update member
    const member: PrivateGroupMember = {
      groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: payload.expiresAt ?? 0,
      inviter: payload.inviter,
      invitee: payload.invitee,
      inviterRawData: payload.inviterRawData,
      inviteeRawData: payload.inviteeRawData,
      inviterSignature: payload.inviterSignature,
      inviteeSignature: payload.inviteeSignature,
    };
    this.memberRepo.upsert(member);

    // Update member count and version
    const activeMembers = this.memberRepo.findActiveMembers(groupId);
    const group = this.groupRepo.findById(groupId);
    if (group) {
      this.groupRepo.setCount(groupId, activeMembers.length);
      const newVersion = genGroupVersion(
        parseInt(group.version.split(".")[0] || "1") + 1,
        group.signature,
        activeMembers,
      );
      this.groupRepo.setVersion(groupId, newVersion);
    }

    const myAddress = this.nknClient.getAddress();

    // Insert join notification message
    const now = Date.now();
    const sessionId = `privateGroup:${groupId}`;
    this.getOrCreateGroupSession(groupId, group?.name ?? "");

    const contact = this.contactRepo.findByAddress(src);
    const senderName = contact?.name ?? src.substring(0, 8) + "...";

    const joinMsg: Message = {
      id: messageData.id,
      sessionId,
      sender: src,
      receiver: groupId,
      contentType: "privateGroup:subscribe",
      content: `${senderName} joined the group`,
      status: "delivered",
      isOutbound: false,
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    if (!this.messageRepo.findById(messageData.id)) {
      this.messageRepo.insert(joinMsg);
      this.sessionRepo.updateLastMessage(sessionId, `${senderName} joined`, messageData.timestamp ?? now);
      this.pushToRenderer("chat:onMessage", joinMsg);
      this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));
    }

    // nMobile flow after accept:
    // 1. Send optionResponse to the new member (clears "data synchronization")
    this.sendOptionResponse(groupId, [payload.invitee]);

    // 2. Send memberResponse with just the new member to OTHER existing members
    const otherMembers = this.getActiveMemberAddresses(groupId)
      .filter((a) => a !== myAddress && a !== payload.invitee);
    if (otherMembers.length > 0) {
      const updatedGroup2 = this.groupRepo.findById(groupId);
      const memberResponseData = {
        id: crypto.randomUUID(),
        contentType: "privateGroup:memberResponse",
        content: {
          groupId,
          version: updatedGroup2?.version ?? "",
          membersData: [this.memberToSnakeCase(member)],
        },
        timestamp: now,
      };
      this.nknClient.sendToMultiple(otherMembers, JSON.stringify(memberResponseData));
      // Also send optionResponse to other members
      this.sendOptionResponse(groupId, otherMembers);
    }

    // Push updated group
    const updatedGroup = this.groupRepo.findById(groupId);
    if (updatedGroup) {
      this.pushToRenderer("privateGroup:onUpdate", updatedGroup);
    }

    console.log(`[PrivateGroupService] ${src} accepted invitation for group ${groupId}`);
  }

  private onMemberSubscribe(src: string, messageData: MessageData): void {
    if (!messageData.groupId) return;

    const sessionId = `privateGroup:${messageData.groupId}`;
    const group = this.groupRepo.findById(messageData.groupId);
    if (!group) return;

    this.getOrCreateGroupSession(messageData.groupId, group.name);

    const now = Date.now();
    const contact = this.contactRepo.findByAddress(src);
    const senderName = contact?.name ?? src.substring(0, 8) + "...";

    const msg: Message = {
      id: messageData.id,
      sessionId,
      sender: src,
      receiver: messageData.groupId,
      contentType: "privateGroup:subscribe",
      content: `${senderName} joined the group`,
      status: "delivered",
      isOutbound: false,
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    if (!this.messageRepo.findById(messageData.id)) {
      this.messageRepo.insert(msg);
      this.sessionRepo.updateLastMessage(sessionId, `${senderName} joined`, messageData.timestamp ?? now);
      this.pushToRenderer("chat:onMessage", msg);
      this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));
    }
  }

  async quit(groupId: string): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const group = this.groupRepo.findById(groupId);
    if (!group) throw new Error("Group not found");

    const keyPair = this.nknClient.getKeyPair();
    const now = Date.now();

    // Build quit raw data
    const rawData = buildMemberRawData({
      expiresAt: 0,
      groupId,
      invitee: myAddress,
      inviter: myAddress,
      permission: PrivateGroupItemPerm.QUIT,
    });
    const signature = await genSignature(keyPair.privateKey, rawData);

    // Send quit to owner (first part of groupId is owner's pubkey)
    const ownerPubKey = groupId.split(".")[0];
    const activeMembers = this.memberRepo.findActiveMembers(groupId);
    const owner = activeMembers.find((m) => m.permission === PrivateGroupItemPerm.OWNER);

    if (owner && owner.invitee !== myAddress) {
      // nMobile format: content is object with full member data, no groupId in outer envelope
      const myMember = this.memberRepo.findByGroupIdAndInvitee(groupId, myAddress);
      const quitMessageData = {
        id: crypto.randomUUID(),
        contentType: "privateGroup:quit",
        content: {
          groupId,
          permission: PrivateGroupItemPerm.QUIT,
          expiresAt: 0,
          inviter: myMember?.inviter ?? myAddress,
          invitee: myAddress,
          inviterRawData: myMember?.inviterRawData ?? "",
          inviteeRawData: rawData,
          inviterSignature: myMember?.inviterSignature ?? "",
          inviteeSignature: signature,
        },
        timestamp: now,
      };
      this.nknClient.sendMessageNoReply(owner.invitee, JSON.stringify(quitMessageData));
    }

    // Mark as left locally
    this.memberRepo.updatePermission(groupId, myAddress, PrivateGroupItemPerm.QUIT);
    this.groupRepo.setJoined(groupId, false);

    // Remove session from the list
    const sessionId = `privateGroup:${groupId}`;
    this.sessionRepo.deleteById(sessionId);
    this.pushToRenderer("session:onDelete", sessionId);

    const updatedGroup = this.groupRepo.findById(groupId);
    if (updatedGroup) {
      this.pushToRenderer("privateGroup:onUpdate", updatedGroup);
    }

    console.log(`[PrivateGroupService] Quit group ${groupId}`);
  }

  private async onMemberQuit(src: string, messageData: MessageData): Promise<void> {
    if (!messageData.content) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try {
      payload = JSON.parse(messageData.content);
    } catch {
      return;
    }

    const groupId = payload.groupId || "";
    const invitee = payload.invitee || src;

    // Verify signature — nMobile sends inviteeSignature; legacy D-Chat sends signature
    const sigData = payload.inviteeRawData || payload.rawData || "";
    const sig = payload.inviteeSignature || payload.signature || "";
    const pubKey = getPubKeyFromAddress(invitee);
    const valid = await verifySignature(pubKey, sigData, sig);
    if (!valid) {
      console.warn("[PrivateGroupService] Invalid quit signature");
      return;
    }

    // Update member permission
    this.memberRepo.updatePermission(groupId, invitee, PrivateGroupItemPerm.QUIT);

    // Update count
    const activeMembers = this.memberRepo.findActiveMembers(groupId);
    this.groupRepo.setCount(groupId, activeMembers.length);

    // Insert quit notification message
    const now = Date.now();
    const sessionId = `privateGroup:${groupId}`;
    const group = this.groupRepo.findById(groupId);
    if (group) {
      this.getOrCreateGroupSession(groupId, group.name);
    }

    const contact = this.contactRepo.findByAddress(src);
    const senderName = contact?.name ?? src.substring(0, 8) + "...";

    const quitMsg: Message = {
      id: messageData.id,
      sessionId,
      sender: src,
      receiver: groupId,
      contentType: "privateGroup:quit",
      content: `${senderName} left the group`,
      status: "delivered",
      isOutbound: false,
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    if (!this.messageRepo.findById(messageData.id)) {
      this.messageRepo.insert(quitMsg);
      this.sessionRepo.updateLastMessage(sessionId, `${senderName} left`, messageData.timestamp ?? now);
      this.pushToRenderer("chat:onMessage", quitMsg);
      this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));
    }

    // Push updated group
    const updatedGroup = this.groupRepo.findById(groupId);
    if (updatedGroup) {
      this.pushToRenderer("privateGroup:onUpdate", updatedGroup);
    }

    console.log(`[PrivateGroupService] ${src} quit group ${payload.groupId}`);
  }

  async kickOut(groupId: string, targetAddress: string): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    // Verify I'm the owner
    const myMember = this.memberRepo.findByGroupIdAndInvitee(groupId, myAddress);
    if (!myMember || myMember.permission !== PrivateGroupItemPerm.OWNER) {
      throw new Error("Only owner can kick members");
    }

    // Set target permission to BLACK
    this.memberRepo.updatePermission(groupId, targetAddress, PrivateGroupItemPerm.BLACK);

    // Update count
    const activeMembers = this.memberRepo.findActiveMembers(groupId);
    this.groupRepo.setCount(groupId, activeMembers.length);

    // Sync updated member list to all remaining members
    await this.syncMembersToAll(groupId);

    const updatedGroup = this.groupRepo.findById(groupId);
    if (updatedGroup) {
      this.pushToRenderer("privateGroup:onUpdate", updatedGroup);
    }

    console.log(`[PrivateGroupService] Kicked ${targetAddress} from group ${groupId}`);
  }

  // ─── Group Messaging ────────────────────────────────────

  async sendGroupMessage(
    groupId: string,
    content: string,
    contentType: MessageContentType = "text",
  ): Promise<Message> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const group = this.groupRepo.findById(groupId);
    if (!group) throw new Error("Group not found");

    const now = Date.now();
    const sessionId = `privateGroup:${groupId}`;
    const messageId = crypto.randomUUID();

    const messageData: MessageData = {
      id: messageId,
      contentType,
      content,
      groupId,
      timestamp: now,
    };

    const message: Message = {
      id: messageId,
      sessionId,
      sender: myAddress,
      receiver: groupId,
      contentType,
      content,
      status: "sending",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };

    this.getOrCreateGroupSession(groupId, group.name);
    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(sessionId, content, now);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    const dests = this.getActiveMemberAddresses(groupId).filter((a) => a !== myAddress);

    if (dests.length > 0) {
      try {
        this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
        this.messageRepo.updateStatus(messageId, "sent");
        message.status = "sent";
        this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
      } catch (err) {
        console.error("[PrivateGroupService] sendGroupMessage failed:", err);
        this.messageRepo.updateStatus(messageId, "failed");
        message.status = "failed";
        this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
      }
    } else {
      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    }

    return message;
  }

  async sendGroupImage(groupId: string, filePath: string): Promise<Message> {
    if (!this.imageService) throw new Error("Image service not configured");

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const group = this.groupRepo.findById(groupId);
    if (!group) throw new Error("Group not found");

    const now = Date.now();
    const sessionId = `privateGroup:${groupId}`;
    const messageId = crypto.randomUUID();

    const message: Message = {
      id: messageId,
      sessionId,
      sender: myAddress,
      receiver: groupId,
      contentType: "ipfs",
      content: "",
      status: "sending",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };

    this.getOrCreateGroupSession(groupId, group.name);
    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(sessionId, "[Image]", now);
    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    try {
      const { options, localFilePath, thumbnailLocalFilePath } =
        await this.imageService.processAndUpload(filePath);

      const ipfsHash = options.ipfsHash ?? "";
      this.messageRepo.updateContent(messageId, ipfsHash);
      this.messageRepo.updateOptions(messageId, JSON.stringify(options));
      this.messageRepo.updateLocalFilePath(messageId, localFilePath);
      this.messageRepo.updateThumbnailLocalFilePath(messageId, thumbnailLocalFilePath);

      message.content = ipfsHash;
      message.options = JSON.stringify(options);
      message.localFilePath = localFilePath;
      message.thumbnailLocalFilePath = thumbnailLocalFilePath;

      this.pushToRenderer("chat:onMessage", { ...message });

      const messageData: MessageData = {
        id: messageId,
        contentType: "ipfs",
        content: ipfsHash,
        options,
        groupId,
        timestamp: now,
      };

      const dests = this.getActiveMemberAddresses(groupId).filter((a) => a !== myAddress);
      if (dests.length > 0) {
        this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
      }

      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    } catch (err) {
      console.error("[PrivateGroupService] sendGroupImage failed:", err);
      this.messageRepo.updateStatus(messageId, "failed");
      message.status = "failed";
      this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
    }

    return message;
  }

  async sendGroupAudio(
    groupId: string,
    audioBuffer: Buffer,
    durationSeconds: number,
  ): Promise<Message> {
    if (!this.audioService) throw new Error("Audio service not configured");

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const group = this.groupRepo.findById(groupId);
    if (!group) throw new Error("Group not found");

    const now = Date.now();
    const sessionId = `privateGroup:${groupId}`;
    const messageId = crypto.randomUUID();

    const result = await this.audioService.processAndUpload(audioBuffer, durationSeconds);

    const message: Message = {
      id: messageId,
      sessionId,
      sender: myAddress,
      receiver: groupId,
      contentType: "audio",
      content: result.content,
      status: "sending",
      isOutbound: true,
      options: JSON.stringify(result.options),
      localFilePath: result.localFilePath,
      createdAt: now,
      updatedAt: now,
    };

    this.getOrCreateGroupSession(groupId, group.name);
    this.messageRepo.insert(message);
    this.messageRepo.updateOptions(messageId, JSON.stringify(result.options));
    this.messageRepo.updateLocalFilePath(messageId, result.localFilePath);
    this.sessionRepo.updateLastMessage(sessionId, "[Audio]", now);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    const messageData: MessageData = {
      id: messageId,
      contentType: "audio",
      content: result.content,
      options: result.options,
      groupId,
      timestamp: now,
    };

    const dests = this.getActiveMemberAddresses(groupId).filter((a) => a !== myAddress);

    if (dests.length > 0) {
      try {
        this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
        this.messageRepo.updateStatus(messageId, "sent");
        message.status = "sent";
        this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
      } catch (err) {
        console.error("[PrivateGroupService] sendGroupAudio failed:", err);
        this.messageRepo.updateStatus(messageId, "failed");
        message.status = "failed";
        this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
      }
    } else {
      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    }

    return message;
  }

  async sendGroupFile(groupId: string, filePath: string): Promise<Message> {
    if (!this.fileService) throw new Error("File service not configured");

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const group = this.groupRepo.findById(groupId);
    if (!group) throw new Error("Group not found");

    const now = Date.now();
    const sessionId = `privateGroup:${groupId}`;
    const messageId = crypto.randomUUID();

    const message: Message = {
      id: messageId,
      sessionId,
      sender: myAddress,
      receiver: groupId,
      contentType: "ipfs",
      content: "",
      status: "sending",
      isOutbound: true,
      createdAt: now,
      updatedAt: now,
    };

    this.getOrCreateGroupSession(groupId, group.name);
    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(sessionId, "[File]", now);
    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    try {
      const { content, options, localFilePath } =
        await this.fileService.processAndUpload(filePath);

      this.messageRepo.updateContent(messageId, content);
      this.messageRepo.updateOptions(messageId, JSON.stringify(options));
      this.messageRepo.updateLocalFilePath(messageId, localFilePath);

      message.content = content;
      message.options = JSON.stringify(options);
      message.localFilePath = localFilePath;

      this.pushToRenderer("chat:onMessage", { ...message });

      const messageData: MessageData = {
        id: messageId,
        contentType: "ipfs",
        content,
        options,
        groupId,
        timestamp: now,
      };

      const dests = this.getActiveMemberAddresses(groupId).filter((a) => a !== myAddress);
      if (dests.length > 0) {
        this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
      }

      this.messageRepo.updateStatus(messageId, "sent");
      message.status = "sent";
      this.pushToRenderer("chat:onMessage", { ...message, status: "sent" });
    } catch (err) {
      console.error("[PrivateGroupService] sendGroupFile failed:", err);
      this.messageRepo.updateStatus(messageId, "failed");
      message.status = "failed";
      this.pushToRenderer("chat:onMessage", { ...message, status: "failed" });
    }

    return message;
  }

  handleIncomingGroupMessage(src: string, messageData: MessageData): void {
    const groupId = messageData.groupId;
    if (!groupId) return;

    const myAddress = this.nknClient.getAddress();
    if (!myAddress) return;

    // Verify sender is an active member
    const senderMember = this.memberRepo.findByGroupIdAndInvitee(groupId, src);
    if (!senderMember || senderMember.permission <= PrivateGroupItemPerm.NONE) {
      console.warn(`[PrivateGroupService] Message from non-member ${src}, ignoring`);
      return;
    }

    // Dedup
    if (this.messageRepo.findById(messageData.id)) return;

    const group = this.groupRepo.findById(groupId);
    if (!group) return;

    const sessionId = `privateGroup:${groupId}`;
    this.getOrCreateGroupSession(groupId, group.name);

    const now = Date.now();
    const content = messageData.content ?? "";
    const optionsJson = messageData.options ? JSON.stringify(messageData.options) : undefined;
    const contentType = messageData.contentType ?? "text";

    const isIpfs = contentType === "ipfs";
    const isAudio = contentType === "audio";
    const fileType = messageData.options?.fileType;
    const isIpfsAudio = isIpfs && (fileType === 2 || fileType === "2");
    const isIpfsImage = isIpfs && (fileType === 1 || fileType === "1" || fileType === undefined);
    const isIpfsFile = isIpfs && !isIpfsAudio && !isIpfsImage;

    const contact = this.contactRepo.findByAddress(src);
    const senderName = contact?.name ?? src.substring(0, 8) + "...";

    const sessionPreview = isAudio || isIpfsAudio
      ? `${senderName}: [Voice Message]`
      : isIpfsFile
        ? `${senderName}: [File]`
        : isIpfs
          ? `${senderName}: [Image]`
          : `${senderName}: ${content}`;

    const message: Message = {
      id: messageData.id,
      sessionId,
      sender: src,
      receiver: groupId,
      contentType,
      content,
      status: "delivered",
      isOutbound: false,
      options: optionsJson,
      createdAt: messageData.timestamp ?? now,
      updatedAt: now,
    };

    this.messageRepo.insert(message);
    this.sessionRepo.updateLastMessage(sessionId, sessionPreview, messageData.timestamp ?? now);
    this.sessionRepo.incrementUnread(sessionId);

    this.pushToRenderer("chat:onMessage", message);
    this.pushToRenderer("session:onUpdate", this.sessionRepo.findById(sessionId));

    // Desktop notification
    if (this.onNotification) {
      const notifBody = isAudio || isIpfsAudio
        ? `${senderName}: Voice Message`
        : isIpfsFile
          ? `${senderName}: File`
          : isIpfs
            ? `${senderName}: Image`
            : `${senderName}: ${content}`;
      this.onNotification(group.name, notifBody, sessionId);
    }

    // Handle inline audio
    if (isAudio && this.audioService && content) {
      const opts = messageData.options ?? {};
      const fileExt = (opts.fileExt as string) ?? "aac";
      const localFilePath = this.audioService.saveInlineAudio(messageData.id, content, fileExt);
      this.messageRepo.updateLocalFilePath(messageData.id, localFilePath);
      this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
    }

    // Background download for IPFS content
    const hasIpfsData =
      messageData.options?.ipfsHash ||
      (isIpfs && content && content.startsWith("Qm"));

    if (isIpfs && hasIpfsData) {
      const opts = messageData.options ?? {};
      if (!opts.ipfsHash && content) {
        opts.ipfsHash = content;
      }

      if (isIpfsAudio && this.audioService) {
        this.downloadGroupIpfsAudio(message, opts).catch(console.error);
      } else if (isIpfsFile && this.fileService) {
        this.downloadGroupIpfsFile(message, opts).catch(console.error);
      } else if (isIpfsImage && this.imageService) {
        this.downloadGroupIpfsThumbnailThenFull(message, opts).catch(console.error);
      }
    }
  }

  // ─── Member Sync ────────────────────────────────────────

  private async syncMembersToAll(groupId: string): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) return;

    const allMembers = this.memberRepo.findByGroupId(groupId);
    const dests = this.getActiveMemberAddresses(groupId).filter((a) => a !== myAddress);

    if (dests.length === 0) return;

    const group = this.groupRepo.findById(groupId);
    const now = Date.now();
    // nMobile format: content is object, uses "membersData" key with snake_case fields
    const messageData = {
      id: crypto.randomUUID(),
      contentType: "privateGroup:memberResponse",
      content: {
        groupId,
        version: group?.version ?? "",
        membersData: allMembers.map((m) => this.memberToSnakeCase(m)),
      },
      timestamp: now,
    };

    this.nknClient.sendToMultiple(dests, JSON.stringify(messageData));
  }

  private onMemberRequest(src: string, messageData: MessageData): void {
    if (!messageData.content) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try {
      payload = JSON.parse(messageData.content);
    } catch {
      return;
    }

    const groupId = payload.groupId || "";
    if (!groupId) return;

    // Verify requester is an active member
    const member = this.memberRepo.findByGroupIdAndInvitee(groupId, src);
    if (!member || member.permission <= PrivateGroupItemPerm.NONE) return;

    const allMembers = this.memberRepo.findByGroupId(groupId);
    const group = this.groupRepo.findById(groupId);
    const now = Date.now();
    // nMobile format: content is object, uses "membersData" key with snake_case fields
    const responseData = {
      id: crypto.randomUUID(),
      contentType: "privateGroup:memberResponse",
      content: {
        groupId,
        version: group?.version ?? "",
        membersData: allMembers.map((m) => this.memberToSnakeCase(m)),
      },
      timestamp: now,
    };

    this.nknClient.sendMessageNoReply(src, JSON.stringify(responseData));
  }

  private onMemberResponse(src: string, messageData: MessageData): void {
    if (!messageData.content) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try {
      payload = JSON.parse(messageData.content);
    } catch {
      return;
    }

    const groupId = payload.groupId || "";
    const group = this.groupRepo.findById(groupId);
    if (!group) return;

    // Merge members from response — nMobile uses "membersData" with snake_case fields
    const membersList = payload.membersData || payload.members || [];
    for (const m of membersList) {
      // Normalize snake_case (from nMobile) to camelCase
      const member: PrivateGroupMember = {
        groupId: m.groupId || m.group_id || "",
        permission: m.permission ?? PrivateGroupItemPerm.NONE,
        expiresAt: m.expiresAt ?? m.expires_at ?? 0,
        inviter: m.inviter || "",
        invitee: m.invitee || "",
        inviterRawData: m.inviterRawData || m.inviter_raw_data || "",
        inviteeRawData: m.inviteeRawData || m.invitee_raw_data || "",
        inviterSignature: m.inviterSignature || m.inviter_signature || "",
        inviteeSignature: m.inviteeSignature || m.invitee_signature || "",
      };
      if (!member.invitee || !member.groupId) continue;
      const existing = this.memberRepo.findByGroupIdAndInvitee(member.groupId, member.invitee);
      if (!existing || member.permission !== existing.permission) {
        this.memberRepo.upsert(member);
      }
    }

    // Update count
    const activeMembers = this.memberRepo.findActiveMembers(groupId);
    this.groupRepo.setCount(groupId, activeMembers.length);

    const updatedGroup = this.groupRepo.findById(groupId);
    if (updatedGroup) {
      this.pushToRenderer("privateGroup:onUpdate", updatedGroup);
    }
  }

  private onOptionRequest(src: string, messageData: MessageData): void {
    if (!messageData.content) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try {
      payload = JSON.parse(messageData.content);
    } catch {
      return;
    }

    const groupId = payload.groupId || "";
    if (!groupId) return;

    // Verify requester is an active member
    const member = this.memberRepo.findByGroupIdAndInvitee(groupId, src);
    if (!member || member.permission <= PrivateGroupItemPerm.NONE) return;

    // Respond with group options (version, signature, etc.)
    this.sendOptionResponse(groupId, [src]);
    console.log(`[PrivateGroupService] Responded to optionRequest from ${src.substring(0, 16)}...`);
  }

  private onOptionResponse(src: string, messageData: MessageData): void {
    if (!messageData.content) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try {
      payload = JSON.parse(messageData.content);
    } catch {
      return;
    }

    const groupId = payload.groupId || "";
    if (!groupId) return;

    const group = this.groupRepo.findById(groupId);
    if (!group) return;

    // Update group with received version, count, signature
    if (payload.version) {
      this.groupRepo.setVersion(groupId, payload.version);
    }
    if (payload.count !== undefined) {
      this.groupRepo.setCount(groupId, payload.count);
    }
    if (payload.signature) {
      this.groupRepo.setSignature(groupId, payload.signature);
    }

    const updatedGroup = this.groupRepo.findById(groupId);
    if (updatedGroup) {
      this.pushToRenderer("privateGroup:onUpdate", updatedGroup);
    }
    console.log(`[PrivateGroupService] Received optionResponse for group ${groupId.substring(0, 20)}...`);
  }

  // ─── Queries ────────────────────────────────────────────

  listGroups(): PrivateGroup[] {
    return this.groupRepo.findAll();
  }

  getGroup(groupId: string): PrivateGroup | undefined {
    return this.groupRepo.findById(groupId);
  }

  getMembers(groupId: string): PrivateGroupMember[] {
    const members = this.memberRepo.findByGroupId(groupId);

    // Sync count if it drifted from active member list
    const activeCount = members.filter(
      (m) => m.permission > PrivateGroupItemPerm.NONE,
    ).length;
    const group = this.groupRepo.findById(groupId);
    if (group && group.count !== activeCount) {
      this.groupRepo.setCount(groupId, activeCount);
      const updated = this.groupRepo.findById(groupId);
      if (updated) this.pushToRenderer("privateGroup:onUpdate", updated);
    }

    return members;
  }

  /** Request member list from group owner/inviter (non-owner) or broadcast to all (owner) */
  async requestMemberSync(groupId: string): Promise<void> {
    const myAddress = this.nknClient.getAddress();
    if (!myAddress) throw new Error("Not connected");

    const myMember = this.memberRepo.findByGroupIdAndInvitee(groupId, myAddress);
    if (!myMember || myMember.permission <= PrivateGroupItemPerm.NONE) {
      throw new Error("Not a member of this group");
    }

    if (myMember.permission === PrivateGroupItemPerm.OWNER) {
      // Owner: broadcast full member list to all members
      await this.syncMembersToAll(groupId);
    } else {
      // Non-owner: request from inviter
      const group = this.groupRepo.findById(groupId);
      const memberRequestData = {
        id: crypto.randomUUID(),
        contentType: "privateGroup:memberRequest",
        content: { groupId, version: group?.version ?? "" },
        timestamp: Date.now(),
      };
      this.nknClient.sendMessageNoReply(
        myMember.inviter,
        JSON.stringify(memberRequestData),
      );
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  /** Convert a PrivateGroupMember to nMobile's snake_case wire format (matches toMap() minus id/data) */
  private memberToSnakeCase(m: PrivateGroupMember): Record<string, unknown> {
    return {
      group_id: m.groupId,
      permission: m.permission,
      expires_at: m.expiresAt,
      inviter: m.inviter,
      invitee: m.invitee,
      inviter_raw_data: m.inviterRawData,
      invitee_raw_data: m.inviteeRawData,
      inviter_signature: m.inviterSignature,
      invitee_signature: m.inviteeSignature,
    };
  }

  /** Send optionResponse to targets — tells them the group version/signature/count so "data synchronization" clears */
  private sendOptionResponse(groupId: string, targets: string[]): void {
    if (targets.length === 0) return;

    const group = this.groupRepo.findById(groupId);
    if (!group) return;

    const now = Date.now();
    const messageData = {
      id: crypto.randomUUID(),
      contentType: "privateGroup:optionResponse",
      content: {
        groupId,
        rawData: group.data, // JSON-encoded group raw data (buildGroupRawData result)
        version: group.version,
        count: group.count,
        signature: group.signature,
      },
      timestamp: now,
    };

    if (targets.length === 1) {
      this.nknClient.sendMessageNoReply(targets[0], JSON.stringify(messageData));
    } else {
      this.nknClient.sendToMultiple(targets, JSON.stringify(messageData));
    }
    console.log(`[PrivateGroupService] Sent optionResponse to ${targets.length} targets for group ${groupId}`);
  }

  private getActiveMemberAddresses(groupId: string): string[] {
    return this.memberRepo.findActiveMembers(groupId).map((m) => m.invitee);
  }

  private getOrCreateGroupSession(groupId: string, name?: string): void {
    const sessionId = `privateGroup:${groupId}`;
    const existing = this.sessionRepo.findById(sessionId);
    if (existing) return;

    const group = this.groupRepo.findById(groupId);
    const displayName = name || group?.name || groupId.substring(0, 12) + "...";

    const now = Date.now();
    this.sessionRepo.upsert({
      id: sessionId,
      type: "privateGroup",
      targetAddress: groupId,
      targetName: displayName,
      lastMessageContent: "",
      lastMessageAt: now,
      unreadCount: 0,
      muted: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ─── IPFS Download helpers (mirrors TopicService) ───────

  private async downloadGroupIpfsImage(
    message: Message,
    opts: MessageOptions,
    retries = 3,
  ): Promise<void> {
    const ipfsHash = opts.ipfsHash || message.content;
    if (!this.imageService || !ipfsHash) return;

    const keyBytes = opts.ipfsEncryptKeyBytes ?? [];
    const nonceSize = opts.ipfsEncryptNonceSize ?? 12;
    const fileExt = opts.fileExt ?? "jpg";
    const preferredIp = opts.ipfsIp;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const localFilePath = await this.imageService.downloadAndDecrypt(
          ipfsHash, keyBytes, nonceSize, fileExt, preferredIp,
        );
        this.messageRepo.updateLocalFilePath(message.id, localFilePath);
        this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
        return;
      } catch (err) {
        console.error(`[PrivateGroupService] IPFS download attempt ${attempt}/${retries} failed for ${ipfsHash}:`, err);
        if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
    this.pushToRenderer("chat:onMessage", { ...message, localFilePath: "__download_failed__" });
  }

  private async downloadGroupIpfsThumbnailThenFull(
    message: Message,
    opts: MessageOptions,
  ): Promise<void> {
    const thumbHash = opts.ipfsThumbnailHash;
    const thumbKeyBytes = opts.ipfsThumbnailEncryptKeyBytes;
    const thumbNonceSize = opts.ipfsThumbnailEncryptNonceSize ?? 12;
    const preferredIp = opts.ipfsThumbnailIp || opts.ipfsIp;

    if (thumbHash && thumbKeyBytes && thumbKeyBytes.length > 0 && this.imageService) {
      try {
        const thumbPath = await this.imageService.downloadAndDecrypt(
          thumbHash, thumbKeyBytes, thumbNonceSize, opts.fileExt ?? "jpg", preferredIp,
        );
        this.messageRepo.updateThumbnailLocalFilePath(message.id, thumbPath);
        this.pushToRenderer("chat:onMessage", { ...message, thumbnailLocalFilePath: thumbPath });
        message.thumbnailLocalFilePath = thumbPath;
      } catch (err) {
        console.error(`[PrivateGroupService] Thumbnail download failed for ${thumbHash}:`, err);
      }
    }

    await this.downloadGroupIpfsImage(message, opts);
  }

  private async downloadGroupIpfsAudio(
    message: Message,
    opts: MessageOptions,
    retries = 3,
  ): Promise<void> {
    const ipfsHash = opts.ipfsHash || message.content;
    if (!this.audioService || !ipfsHash) return;

    const keyBytes = opts.ipfsEncryptKeyBytes ?? [];
    const nonceSize = opts.ipfsEncryptNonceSize ?? 12;
    const fileExt = (opts.fileExt as string) ?? "aac";
    const preferredIp = opts.ipfsIp;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const localFilePath = await this.audioService.downloadAndDecrypt(
          ipfsHash, keyBytes, nonceSize, fileExt, preferredIp,
        );
        this.messageRepo.updateLocalFilePath(message.id, localFilePath);
        this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
        return;
      } catch (err) {
        console.error(`[PrivateGroupService] IPFS audio download attempt ${attempt}/${retries} failed:`, err);
        if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
    this.pushToRenderer("chat:onMessage", { ...message, localFilePath: "__download_failed__" });
  }

  private async downloadGroupIpfsFile(
    message: Message,
    opts: MessageOptions,
    retries = 3,
  ): Promise<void> {
    const ipfsHash = opts.ipfsHash || message.content;
    if (!this.fileService || !ipfsHash) return;

    const keyBytes = opts.ipfsEncryptKeyBytes ?? [];
    const nonceSize = opts.ipfsEncryptNonceSize ?? 12;
    const fileExt = (opts.fileExt as string) ?? "bin";
    const fileName = opts.fileName as string | undefined;
    const preferredIp = opts.ipfsIp;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const localFilePath = await this.fileService.downloadAndDecrypt(
          ipfsHash, keyBytes, nonceSize, fileExt, fileName, preferredIp,
        );
        this.messageRepo.updateLocalFilePath(message.id, localFilePath);
        this.pushToRenderer("chat:onMessage", { ...message, localFilePath });
        return;
      } catch (err) {
        console.error(`[PrivateGroupService] IPFS file download attempt ${attempt}/${retries} failed:`, err);
        if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    this.messageRepo.updateLocalFilePath(message.id, "__download_failed__");
    this.pushToRenderer("chat:onMessage", { ...message, localFilePath: "__download_failed__" });
  }
}
