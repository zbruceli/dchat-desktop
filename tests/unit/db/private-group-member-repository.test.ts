import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3-multiple-ciphers";
import { PrivateGroupMemberRepository } from "../../../src/main/db/repositories/private-group-member-repository";
import { createTestDb } from "../../helpers/db-helpers";
import type { PrivateGroupMember } from "../../../src/shared/types";
import { PrivateGroupItemPerm } from "../../../src/shared/types/private-group";

let db: Database.Database;
let repo: PrivateGroupMemberRepository;

beforeEach(() => {
  db = createTestDb();
  repo = new PrivateGroupMemberRepository(db);
});

afterEach(() => {
  db.close();
});

function makeMember(
  groupId: string,
  invitee: string,
  overrides: Partial<PrivateGroupMember> = {},
): PrivateGroupMember {
  return {
    groupId,
    permission: overrides.permission ?? PrivateGroupItemPerm.NORMAL,
    expiresAt: overrides.expiresAt ?? 0,
    inviter: overrides.inviter ?? "owner.addr",
    invitee,
    inviterRawData: overrides.inviterRawData ?? "raw-inviter",
    inviteeRawData: overrides.inviteeRawData ?? "raw-invitee",
    inviterSignature: overrides.inviterSignature ?? "sig-inviter",
    inviteeSignature: overrides.inviteeSignature ?? "sig-invitee",
  };
}

describe("PrivateGroupMemberRepository", () => {
  describe("upsert", () => {
    it("inserts a new member", () => {
      repo.upsert(makeMember("g1", "alice.addr"));
      const members = repo.findByGroupId("g1");
      expect(members).toHaveLength(1);
      expect(members[0].invitee).toBe("alice.addr");
      expect(members[0].permission).toBe(PrivateGroupItemPerm.NORMAL);
    });

    it("updates existing member on composite key conflict", () => {
      repo.upsert(makeMember("g1", "alice.addr", { permission: PrivateGroupItemPerm.NORMAL }));
      repo.upsert(makeMember("g1", "alice.addr", { permission: PrivateGroupItemPerm.ADMIN }));
      const members = repo.findByGroupId("g1");
      expect(members).toHaveLength(1);
      expect(members[0].permission).toBe(PrivateGroupItemPerm.ADMIN);
    });
  });

  describe("findByGroupId", () => {
    it("returns members ordered by permission DESC", () => {
      repo.upsert(makeMember("g1", "normal.addr", { permission: PrivateGroupItemPerm.NORMAL }));
      repo.upsert(makeMember("g1", "owner.addr", { permission: PrivateGroupItemPerm.OWNER }));
      repo.upsert(makeMember("g1", "admin.addr", { permission: PrivateGroupItemPerm.ADMIN }));
      const members = repo.findByGroupId("g1");
      expect(members.map((m) => m.permission)).toEqual([
        PrivateGroupItemPerm.OWNER,
        PrivateGroupItemPerm.ADMIN,
        PrivateGroupItemPerm.NORMAL,
      ]);
    });

    it("returns empty array for non-existent group", () => {
      expect(repo.findByGroupId("nonexistent")).toEqual([]);
    });
  });

  describe("findByGroupIdAndInvitee", () => {
    it("returns the matching member", () => {
      repo.upsert(makeMember("g1", "alice.addr", { inviter: "bob.addr" }));
      const member = repo.findByGroupIdAndInvitee("g1", "alice.addr");
      expect(member).toBeDefined();
      expect(member!.inviter).toBe("bob.addr");
    });

    it("returns undefined for non-matching invitee", () => {
      repo.upsert(makeMember("g1", "alice.addr"));
      expect(repo.findByGroupIdAndInvitee("g1", "bob.addr")).toBeUndefined();
    });
  });

  describe("findActiveMembers", () => {
    it("excludes QUIT and BLACK members (permission <= 0)", () => {
      repo.upsert(makeMember("g1", "active.addr", { permission: PrivateGroupItemPerm.NORMAL }));
      repo.upsert(makeMember("g1", "quit.addr", { permission: PrivateGroupItemPerm.QUIT }));
      repo.upsert(makeMember("g1", "black.addr", { permission: PrivateGroupItemPerm.BLACK }));
      repo.upsert(makeMember("g1", "none.addr", { permission: PrivateGroupItemPerm.NONE }));
      const active = repo.findActiveMembers("g1");
      expect(active).toHaveLength(1);
      expect(active[0].invitee).toBe("active.addr");
    });

    it("returns members ordered by permission DESC", () => {
      repo.upsert(makeMember("g1", "normal.addr", { permission: PrivateGroupItemPerm.NORMAL }));
      repo.upsert(makeMember("g1", "owner.addr", { permission: PrivateGroupItemPerm.OWNER }));
      const active = repo.findActiveMembers("g1");
      expect(active[0].permission).toBe(PrivateGroupItemPerm.OWNER);
      expect(active[1].permission).toBe(PrivateGroupItemPerm.NORMAL);
    });
  });

  describe("updatePermission", () => {
    it("updates the permission for a specific member", () => {
      repo.upsert(makeMember("g1", "alice.addr", { permission: PrivateGroupItemPerm.NORMAL }));
      repo.updatePermission("g1", "alice.addr", PrivateGroupItemPerm.ADMIN);
      const member = repo.findByGroupIdAndInvitee("g1", "alice.addr");
      expect(member!.permission).toBe(PrivateGroupItemPerm.ADMIN);
    });
  });

  describe("deleteByGroupId", () => {
    it("deletes all members for a group", () => {
      repo.upsert(makeMember("g1", "alice.addr"));
      repo.upsert(makeMember("g1", "bob.addr"));
      repo.deleteByGroupId("g1");
      expect(repo.findByGroupId("g1")).toEqual([]);
    });

    it("does not affect other groups", () => {
      repo.upsert(makeMember("g1", "alice.addr"));
      repo.upsert(makeMember("g2", "bob.addr"));
      repo.deleteByGroupId("g1");
      expect(repo.findByGroupId("g2")).toHaveLength(1);
    });
  });
});
