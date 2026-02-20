import type Database from "better-sqlite3";
import type { PrivateGroupMember, PrivateGroupPermission } from "../../../shared/types";

interface MemberRow {
  group_id: string;
  permission: number;
  expires_at: number | null;
  inviter: string | null;
  invitee: string;
  inviter_raw_data: string | null;
  invitee_raw_data: string | null;
  inviter_signature: string | null;
  invitee_signature: string | null;
}

function rowToMember(row: MemberRow): PrivateGroupMember {
  return {
    groupId: row.group_id,
    permission: row.permission as PrivateGroupPermission,
    expiresAt: row.expires_at ?? 0,
    inviter: row.inviter ?? "",
    invitee: row.invitee,
    inviterRawData: row.inviter_raw_data ?? "",
    inviteeRawData: row.invitee_raw_data ?? "",
    inviterSignature: row.inviter_signature ?? "",
    inviteeSignature: row.invitee_signature ?? "",
  };
}

export class PrivateGroupMemberRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsert(member: PrivateGroupMember): void {
    this.db
      .prepare(
        `INSERT INTO private_group_member (group_id, permission, expires_at, inviter, invitee, inviter_raw_data, invitee_raw_data, inviter_signature, invitee_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(group_id, invitee) DO UPDATE SET
           permission = excluded.permission,
           expires_at = excluded.expires_at,
           inviter = excluded.inviter,
           inviter_raw_data = excluded.inviter_raw_data,
           invitee_raw_data = excluded.invitee_raw_data,
           inviter_signature = excluded.inviter_signature,
           invitee_signature = excluded.invitee_signature`,
      )
      .run(
        member.groupId,
        member.permission,
        member.expiresAt || null,
        member.inviter || null,
        member.invitee,
        member.inviterRawData || null,
        member.inviteeRawData || null,
        member.inviterSignature || null,
        member.inviteeSignature || null,
      );
  }

  findByGroupId(groupId: string): PrivateGroupMember[] {
    const rows = this.db
      .prepare(`SELECT * FROM private_group_member WHERE group_id = ? ORDER BY permission DESC`)
      .all(groupId) as MemberRow[];
    return rows.map(rowToMember);
  }

  findByGroupIdAndInvitee(groupId: string, invitee: string): PrivateGroupMember | undefined {
    const row = this.db
      .prepare(`SELECT * FROM private_group_member WHERE group_id = ? AND invitee = ?`)
      .get(groupId, invitee) as MemberRow | undefined;
    return row ? rowToMember(row) : undefined;
  }

  findActiveMembers(groupId: string): PrivateGroupMember[] {
    const rows = this.db
      .prepare(`SELECT * FROM private_group_member WHERE group_id = ? AND permission > 0 ORDER BY permission DESC`)
      .all(groupId) as MemberRow[];
    return rows.map(rowToMember);
  }

  updatePermission(groupId: string, invitee: string, permission: PrivateGroupPermission): void {
    this.db
      .prepare(`UPDATE private_group_member SET permission = ? WHERE group_id = ? AND invitee = ?`)
      .run(permission, groupId, invitee);
  }

  deleteByGroupId(groupId: string): void {
    this.db.prepare(`DELETE FROM private_group_member WHERE group_id = ?`).run(groupId);
  }
}
