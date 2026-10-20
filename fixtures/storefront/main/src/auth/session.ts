import { randomUUID } from "node:crypto";
import { addMinutes } from "../utils/date";

export interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
}

const SESSION_TTL_MINUTES = 30;
const sessions = new Map<string, Session>();

export function createSession(userId: string): Session {
  const session = {
    token: randomUUID(),
    userId,
    expiresAt: addMinutes(new Date(), SESSION_TTL_MINUTES),
  };
  sessions.set(session.token, session);
  return session;
}

export function getSession(token: string): Session | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt < new Date()) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

export function endSession(token: string): void {
  sessions.delete(token);
}
