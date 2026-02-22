import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3-multiple-ciphers";
import { SessionService } from "../../../src/main/services/session-service";
import { SessionRepository } from "../../../src/main/db/repositories/session-repository";
import { createTestDb, makeSession } from "../../helpers/db-helpers";

let db: Database.Database;
let sessionRepo: SessionRepository;
let sessionService: SessionService;

beforeEach(() => {
  db = createTestDb();
  sessionRepo = new SessionRepository(db);
  sessionService = new SessionService(sessionRepo);
});

afterEach(() => {
  db.close();
});

describe("SessionService", () => {
  it("listSessions returns all sessions", () => {
    makeSession(db, "direct:alice", { targetAddress: "alice" });
    makeSession(db, "direct:bob", { targetAddress: "bob" });
    const sessions = sessionService.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it("getSession returns session by ID", () => {
    makeSession(db, "direct:alice", { targetAddress: "alice", targetName: "Alice" });
    const session = sessionService.getSession("direct:alice");
    expect(session).toBeDefined();
    expect(session!.targetName).toBe("Alice");
  });

  it("getSession returns undefined for non-existent", () => {
    expect(sessionService.getSession("nonexistent")).toBeUndefined();
  });

  it("setMuted returns updated session", () => {
    makeSession(db, "direct:alice", { targetAddress: "alice", muted: false });
    const result = sessionService.setMuted("direct:alice", true);
    expect(result).toBeDefined();
    expect(result!.muted).toBe(true);
  });

  it("setMuted returns undefined for non-existent session", () => {
    const result = sessionService.setMuted("nonexistent", true);
    expect(result).toBeUndefined();
  });

  it("deleteSession removes the session", () => {
    makeSession(db, "direct:alice", { targetAddress: "alice" });
    sessionService.deleteSession("direct:alice");
    expect(sessionService.getSession("direct:alice")).toBeUndefined();
  });
});
