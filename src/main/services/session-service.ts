import type { SessionRepository } from "../db/repositories/session-repository";
import type { Session } from "../../shared/types";

export class SessionService {
  constructor(private sessionRepo: SessionRepository) {}

  listSessions(): Session[] {
    return this.sessionRepo.findAll();
  }

  getSession(id: string): Session | undefined {
    return this.sessionRepo.findById(id);
  }

  setMuted(id: string, muted: boolean): Session | undefined {
    this.sessionRepo.setMuted(id, muted);
    return this.sessionRepo.findById(id);
  }

  deleteSession(id: string): void {
    this.sessionRepo.deleteById(id);
  }
}
