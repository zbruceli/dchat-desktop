import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { PrivateGroupService } from "../../../src/main/services/private-group-service";
import { PrivateGroupRepository } from "../../../src/main/db/repositories/private-group-repository";
import { PrivateGroupMemberRepository } from "../../../src/main/db/repositories/private-group-member-repository";
import { MessageRepository } from "../../../src/main/db/repositories/message-repository";
import { SessionRepository } from "../../../src/main/db/repositories/session-repository";
import { ContactRepository } from "../../../src/main/db/repositories/contact-repository";
import { runMigrations } from "../../../src/main/db/migrations/migration-runner";
import { MockNknClient } from "../../helpers/mock-nkn-client";
import { PrivateGroupItemPerm } from "../../../src/shared/types/private-group";
import type { MessageData } from "../../../src/shared/types";

// Mock the crypto functions to avoid needing real nkn-sdk/libsodium
vi.mock("../../../src/main/crypto/ed25519-signature", () => ({
  getPubKeyFromAddress: (addr: string) => {
    const parts = addr.split(".");
    return parts[parts.length - 1];
  },
  genSignature: vi.fn(async () => "mock-signature-hex"),
  verifySignature: vi.fn(async () => true),
  buildMemberRawData: vi.fn((fields: Record<string, unknown>) => JSON.stringify(fields)),
  buildGroupRawData: vi.fn((fields: Record<string, unknown>) => JSON.stringify(fields)),
  genGroupVersion: vi.fn((_commits: number, _sig: string, _members: unknown[]) => "1.mockversion"),
}));

let db: Database.Database;
let groupRepo: PrivateGroupRepository;
let memberRepo: PrivateGroupMemberRepository;
let messageRepo: MessageRepository;
let sessionRepo: SessionRepository;
let contactRepo: ContactRepository;
let nknClient: MockNknClient;
let pushToRenderer: ReturnType<typeof vi.fn>;
let pgService: PrivateGroupService;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  groupRepo = new PrivateGroupRepository(db);
  memberRepo = new PrivateGroupMemberRepository(db);
  messageRepo = new MessageRepository(db);
  sessionRepo = new SessionRepository(db);
  contactRepo = new ContactRepository(db);
  nknClient = new MockNknClient();
  pushToRenderer = vi.fn();

  pgService = new PrivateGroupService(
    nknClient.asService(),
    groupRepo,
    memberRepo,
    messageRepo,
    sessionRepo,
    contactRepo,
    pushToRenderer,
  );
});

afterEach(() => {
  db.close();
  vi.clearAllMocks();
});

describe("PrivateGroupService — createGroup", () => {
  it("creates group with correct groupId format", async () => {
    const group = await pgService.createGroup("Test Group");
    // Format: {publicKeyHex}.{uuidNoHyphens}
    expect(group.groupId).toContain(".");
    const [pubKeyPart, uuidPart] = group.groupId.split(".");
    expect(pubKeyPart).toBe("ab1234567890abcdef");
    expect(uuidPart.length).toBe(32); // UUID without hyphens
  });

  it("sets owner with OWNER permission", async () => {
    const group = await pgService.createGroup("Test Group");
    const members = memberRepo.findByGroupId(group.groupId);
    expect(members).toHaveLength(1);
    expect(members[0].permission).toBe(PrivateGroupItemPerm.OWNER);
    expect(members[0].invitee).toBe("my.nkn.address");
  });

  it("creates DB group record with joined=true", async () => {
    const group = await pgService.createGroup("Test Group");
    const stored = groupRepo.findById(group.groupId);
    expect(stored).toBeDefined();
    expect(stored!.joined).toBe(true);
    expect(stored!.count).toBe(1);
    expect(stored!.name).toBe("Test Group");
  });

  it("creates a session for the group", async () => {
    const group = await pgService.createGroup("Test Group");
    const session = sessionRepo.findById(`privateGroup:${group.groupId}`);
    expect(session).toBeDefined();
    expect(session!.type).toBe("privateGroup");
  });

  it("sets initial version", async () => {
    const group = await pgService.createGroup("Test Group");
    expect(group.version).toBe("1.mockversion");
  });

  it("pushes privateGroup:onUpdate event", async () => {
    await pgService.createGroup("Test Group");
    const updates = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "privateGroup:onUpdate",
    );
    expect(updates.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when not connected", async () => {
    nknClient.setDisconnected();
    await expect(pgService.createGroup("Test")).rejects.toThrow("Not connected");
  });
});

describe("PrivateGroupService — invite", () => {
  let groupId: string;

  beforeEach(async () => {
    const group = await pgService.createGroup("Test Group");
    groupId = group.groupId;
    nknClient.sendMessageNoReply.mockClear();
    pushToRenderer.mockClear();
  });

  it("sends invitation wire format to target", async () => {
    await pgService.invite(groupId, "bob.addr");
    expect(nknClient.sendMessageNoReply).toHaveBeenCalled();
    const [dest, payload] = nknClient.sendMessageNoReply.mock.calls[0];
    expect(dest).toBe("bob.addr");
    const data = JSON.parse(payload);
    expect(data.contentType).toBe("privateGroup:invitation");
    expect(data.content.groupId).toBe(groupId);
  });

  it("throws when not connected", async () => {
    nknClient.setDisconnected();
    await expect(pgService.invite(groupId, "bob.addr")).rejects.toThrow("Not connected");
  });

  it("throws when group not found", async () => {
    await expect(pgService.invite("nonexistent.group", "bob.addr")).rejects.toThrow(
      "Group not found",
    );
  });

  it("throws when user has no permission", async () => {
    // Create a new member with NORMAL permission
    memberRepo.upsert({
      groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: Date.now() + 86400000,
      inviter: "my.nkn.address",
      invitee: "normal.addr",
      inviterRawData: "",
      inviteeRawData: "",
      inviterSignature: "",
      inviteeSignature: "",
    });

    // Simulate being "normal.addr" by reconnecting as that address
    nknClient.setConnected("normal.addr");
    await expect(pgService.invite(groupId, "carol.addr")).rejects.toThrow(
      "No permission to invite",
    );
  });

  it("throws when target is already an active member", async () => {
    memberRepo.upsert({
      groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: Date.now() + 86400000,
      inviter: "my.nkn.address",
      invitee: "bob.addr",
      inviterRawData: "",
      inviteeRawData: "",
      inviterSignature: "",
      inviteeSignature: "",
    });
    await expect(pgService.invite(groupId, "bob.addr")).rejects.toThrow("Already a member");
  });

  it("creates outbound invitation message", async () => {
    await pgService.invite(groupId, "bob.addr");
    const messages = messageRepo.findBySessionId(`privateGroup:${groupId}`);
    const inviteMsg = messages.find((m) => m.contentType === "privateGroup:invitation");
    expect(inviteMsg).toBeDefined();
    expect(inviteMsg!.isOutbound).toBe(true);
  });
});

describe("PrivateGroupService — handleIncomingControlMessage routing", () => {
  it("routes invitation to onInvitationReceived", async () => {
    const msg: MessageData = {
      id: "ctrl-1",
      contentType: "privateGroup:invitation",
      content: JSON.stringify({
        groupId: "owner.uuid123",
        name: "Test",
        type: 0,
        version: "1.abc",
        item: {
          groupId: "owner.uuid123",
          permission: 10,
          expiresAt: Date.now() + 86400000,
          invitee: "my.nkn.address",
          inviter: "owner.addr",
          inviterRawData: "raw",
          inviterSignature: "sig",
        },
      }),
      timestamp: Date.now(),
    };
    await pgService.handleIncomingControlMessage("owner.addr", msg);
    // Should have created the group in DB
    const group = groupRepo.findById("owner.uuid123");
    expect(group).toBeDefined();
  });

  it("routes quit to onMemberQuit", async () => {
    const group = await pgService.createGroup("Test Group");
    // Add bob as a member
    memberRepo.upsert({
      groupId: group.groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: Date.now() + 86400000,
      inviter: "my.nkn.address",
      invitee: "bob.addr",
      inviterRawData: "raw",
      inviteeRawData: "raw",
      inviterSignature: "sig",
      inviteeSignature: "sig",
    });

    const msg: MessageData = {
      id: "quit-1",
      contentType: "privateGroup:quit",
      content: JSON.stringify({
        groupId: group.groupId,
        item: {
          invitee: "bob.addr",
          inviterRawData: "raw",
          inviteeRawData: "raw",
          inviterSignature: "sig",
          inviteeSignature: "sig",
        },
      }),
      timestamp: Date.now(),
    };
    await pgService.handleIncomingControlMessage("bob.addr", msg);

    const member = memberRepo.findByGroupIdAndInvitee(group.groupId, "bob.addr");
    expect(member!.permission).toBe(PrivateGroupItemPerm.QUIT);
  });
});

describe("PrivateGroupService — onInvitationReceived", () => {
  it("ignores invitation with no content", async () => {
    const msg: MessageData = {
      id: "empty-inv",
      contentType: "privateGroup:invitation",
      content: undefined,
      timestamp: Date.now(),
    };
    await pgService.handleIncomingControlMessage("owner.addr", msg);
    // Should not throw, no group created
    expect(groupRepo.findAll()).toHaveLength(0);
  });

  it("creates group metadata for valid invitation", async () => {
    const msg: MessageData = {
      id: "inv-1",
      contentType: "privateGroup:invitation",
      content: JSON.stringify({
        groupId: "ownerkey.uuid111",
        name: "Cool Group",
        type: 0,
        version: "1.abc",
        item: {
          groupId: "ownerkey.uuid111",
          permission: 10,
          expiresAt: Date.now() + 86400000,
          invitee: "my.nkn.address",
          inviter: "owner.addr",
          inviterRawData: "rawdata",
          inviterSignature: "invitersig",
        },
      }),
      timestamp: Date.now(),
    };
    await pgService.handleIncomingControlMessage("owner.addr", msg);

    const group = groupRepo.findById("ownerkey.uuid111");
    expect(group).toBeDefined();
    expect(group!.name).toBe("Cool Group");
    expect(group!.joined).toBe(false); // Not yet accepted
  });

  it("stores invitation message in session", async () => {
    const msg: MessageData = {
      id: "inv-2",
      contentType: "privateGroup:invitation",
      content: JSON.stringify({
        groupId: "ownerkey.uuid222",
        name: "Group 2",
        type: 0,
        version: "1.abc",
        item: {
          groupId: "ownerkey.uuid222",
          permission: 10,
          expiresAt: Date.now() + 86400000,
          invitee: "my.nkn.address",
          inviter: "owner.addr",
          inviterRawData: "raw",
          inviterSignature: "sig",
        },
      }),
      timestamp: Date.now(),
    };
    await pgService.handleIncomingControlMessage("owner.addr", msg);

    const session = sessionRepo.findById("privateGroup:ownerkey.uuid222");
    expect(session).toBeDefined();
    const messages = messageRepo.findBySessionId("privateGroup:ownerkey.uuid222");
    const invMsg = messages.find((m) => m.contentType === "privateGroup:invitation");
    expect(invMsg).toBeDefined();
    expect(invMsg!.isOutbound).toBe(false);
  });
});

describe("PrivateGroupService — acceptInvitation", () => {
  const groupId = "ownerkey.uuid333";

  beforeEach(async () => {
    // Simulate receiving an invitation
    const msg: MessageData = {
      id: "inv-accept",
      contentType: "privateGroup:invitation",
      content: JSON.stringify({
        groupId,
        name: "Accept Group",
        type: 0,
        version: "1.abc",
        item: {
          groupId,
          permission: 10,
          expiresAt: Date.now() + 86400000,
          invitee: "my.nkn.address",
          inviter: "owner.addr",
          inviterRawData: "rawdata",
          inviterSignature: "invitersig",
        },
      }),
      timestamp: Date.now(),
    };
    await pgService.handleIncomingControlMessage("owner.addr", msg);
    nknClient.sendMessageNoReply.mockClear();
    pushToRenderer.mockClear();
  });

  it("marks group as joined", async () => {
    await pgService.acceptInvitation(groupId);
    const group = groupRepo.findById(groupId);
    expect(group!.joined).toBe(true);
  });

  it("sends accept message to inviter", async () => {
    await pgService.acceptInvitation(groupId);
    expect(nknClient.sendMessageNoReply).toHaveBeenCalled();
    const calls = nknClient.sendMessageNoReply.mock.calls;
    const acceptCall = calls.find(([, payload]: [string, string]) => {
      const data = JSON.parse(payload);
      return data.contentType === "privateGroup:accept";
    });
    expect(acceptCall).toBeDefined();
  });

  it("updates member with invitee signature", async () => {
    await pgService.acceptInvitation(groupId);
    const member = memberRepo.findByGroupIdAndInvitee(groupId, "my.nkn.address");
    expect(member).toBeDefined();
    expect(member!.inviteeSignature).toBe("mock-signature-hex");
  });
});

describe("PrivateGroupService — quit", () => {
  let groupId: string;

  beforeEach(async () => {
    // Create group as owner, then add a second member and "become" them
    const group = await pgService.createGroup("Quit Group");
    groupId = group.groupId;
    // Add bob as a regular member
    memberRepo.upsert({
      groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: Date.now() + 86400000,
      inviter: "my.nkn.address",
      invitee: "bob.addr",
      inviterRawData: "raw",
      inviteeRawData: "raw",
      inviterSignature: "sig",
      inviteeSignature: "sig",
    });
    // Switch to bob so that quit sends to owner
    nknClient.setConnected("bob.addr");
    nknClient.sendMessageNoReply.mockClear();
    pushToRenderer.mockClear();
  });

  it("sends quit message to owner", async () => {
    await pgService.quit(groupId);
    expect(nknClient.sendMessageNoReply).toHaveBeenCalled();
    const quitCalls = nknClient.sendMessageNoReply.mock.calls.filter(
      ([, payload]: [string, string]) => {
        try {
          const data = JSON.parse(payload);
          return data.contentType === "privateGroup:quit";
        } catch {
          return false;
        }
      },
    );
    expect(quitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("marks member as QUIT", async () => {
    await pgService.quit(groupId);
    const member = memberRepo.findByGroupIdAndInvitee(groupId, "bob.addr");
    expect(member!.permission).toBe(PrivateGroupItemPerm.QUIT);
  });

  it("pushes session:onDelete event", async () => {
    await pgService.quit(groupId);
    const deleteEvents = pushToRenderer.mock.calls.filter(
      ([ch]: [string]) => ch === "session:onDelete",
    );
    expect(deleteEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("PrivateGroupService — kickOut", () => {
  let groupId: string;

  beforeEach(async () => {
    const group = await pgService.createGroup("Kick Group");
    groupId = group.groupId;
    // Add bob as member
    memberRepo.upsert({
      groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: Date.now() + 86400000,
      inviter: "my.nkn.address",
      invitee: "bob.addr",
      inviterRawData: "raw",
      inviteeRawData: "raw",
      inviterSignature: "sig",
      inviteeSignature: "sig",
    });
    pushToRenderer.mockClear();
  });

  it("sets member permission to BLACK", async () => {
    await pgService.kickOut(groupId, "bob.addr");
    const member = memberRepo.findByGroupIdAndInvitee(groupId, "bob.addr");
    expect(member!.permission).toBe(PrivateGroupItemPerm.BLACK);
  });

  it("throws when not owner", async () => {
    nknClient.setConnected("bob.addr");
    await expect(pgService.kickOut(groupId, "my.nkn.address")).rejects.toThrow();
  });
});

describe("PrivateGroupService — sendGroupMessage", () => {
  let groupId: string;

  beforeEach(async () => {
    const group = await pgService.createGroup("Msg Group");
    groupId = group.groupId;
    // Add bob as active member
    memberRepo.upsert({
      groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: Date.now() + 86400000,
      inviter: "my.nkn.address",
      invitee: "bob.addr",
      inviterRawData: "raw",
      inviteeRawData: "raw",
      inviterSignature: "sig",
      inviteeSignature: "sig",
    });
    nknClient.sendToMultiple.mockClear();
    pushToRenderer.mockClear();
  });

  it("sends to active members minus self", async () => {
    const msg = await pgService.sendGroupMessage(groupId, "Hello group");
    expect(msg.status).toBe("sent");
    expect(nknClient.sendToMultiple).toHaveBeenCalled();
    const [dests] = nknClient.sendToMultiple.mock.calls[0];
    expect(dests).not.toContain("my.nkn.address");
    expect(dests).toContain("bob.addr");
  });

  it("includes groupId field in wire message", async () => {
    await pgService.sendGroupMessage(groupId, "Hi");
    const [, payload] = nknClient.sendToMultiple.mock.calls[0];
    const data = JSON.parse(payload);
    expect(data.groupId).toBe(groupId);
    expect(data.contentType).toBe("text");
  });

  it("marks failed on error", async () => {
    nknClient.sendToMultiple.mockImplementationOnce(() => {
      throw new Error("send failed");
    });
    const msg = await pgService.sendGroupMessage(groupId, "Fail");
    expect(msg.status).toBe("failed");
  });

  it("persists message in DB", async () => {
    const msg = await pgService.sendGroupMessage(groupId, "Stored");
    const stored = messageRepo.findById(msg.id);
    expect(stored).toBeDefined();
    expect(stored!.sessionId).toBe(`privateGroup:${groupId}`);
  });
});

describe("PrivateGroupService — handleIncomingGroupMessage", () => {
  let groupId: string;

  beforeEach(async () => {
    const group = await pgService.createGroup("Receive Group");
    groupId = group.groupId;
    // Add bob as member
    memberRepo.upsert({
      groupId,
      permission: PrivateGroupItemPerm.NORMAL,
      expiresAt: Date.now() + 86400000,
      inviter: "my.nkn.address",
      invitee: "bob.addr",
      inviterRawData: "raw",
      inviteeRawData: "raw",
      inviterSignature: "sig",
      inviteeSignature: "sig",
    });
    pushToRenderer.mockClear();
  });

  it("stores incoming group message", () => {
    const msg: MessageData = {
      id: "group-msg-1",
      contentType: "text",
      content: "Hello group",
      groupId,
      timestamp: Date.now(),
    };
    pgService.handleIncomingGroupMessage("bob.addr", msg);
    const stored = messageRepo.findById("group-msg-1");
    expect(stored).toBeDefined();
    expect(stored!.sessionId).toBe(`privateGroup:${groupId}`);
  });

  it("deduplicates by message ID", () => {
    const msg: MessageData = {
      id: "dup-group-msg",
      contentType: "text",
      content: "Hello",
      groupId,
      timestamp: Date.now(),
    };
    pgService.handleIncomingGroupMessage("bob.addr", msg);
    pgService.handleIncomingGroupMessage("bob.addr", msg);
    const messages = messageRepo.findBySessionId(`privateGroup:${groupId}`);
    const dupes = messages.filter((m) => m.id === "dup-group-msg");
    expect(dupes).toHaveLength(1);
  });

  it("rejects messages from non-members", () => {
    const msg: MessageData = {
      id: "nonmember-msg",
      contentType: "text",
      content: "Hello",
      groupId,
      timestamp: Date.now(),
    };
    pgService.handleIncomingGroupMessage("stranger.addr", msg);
    expect(messageRepo.findById("nonmember-msg")).toBeUndefined();
  });

  it("increments unread count", () => {
    const msg: MessageData = {
      id: "unread-group",
      contentType: "text",
      content: "Hi",
      groupId,
      timestamp: Date.now(),
    };
    pgService.handleIncomingGroupMessage("bob.addr", msg);
    const session = sessionRepo.findById(`privateGroup:${groupId}`);
    expect(session!.unreadCount).toBe(1);
  });
});

describe("PrivateGroupService — getMembers / listGroups", () => {
  it("getMembers returns members for a group", async () => {
    const group = await pgService.createGroup("Members Group");
    const members = pgService.getMembers(group.groupId);
    expect(members).toHaveLength(1);
    expect(members[0].invitee).toBe("my.nkn.address");
  });

  it("listGroups returns all groups", async () => {
    await pgService.createGroup("Group 1");
    await pgService.createGroup("Group 2");
    const groups = pgService.listGroups();
    expect(groups).toHaveLength(2);
  });

  it("getGroup returns specific group", async () => {
    const group = await pgService.createGroup("Specific");
    const found = pgService.getGroup(group.groupId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Specific");
  });
});
