import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { addMinutes } from "../utils/date";

export interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
  rotatedFrom?: string;
}

export interface SessionOptions {
  ttlMinutes?: number;
}

const DEFAULT_TTL_MINUTES = 30;
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret");
const sessions = new Map<string, Session>();

async function signToken(userId: string, ttlMinutes: number): Promise<string> {
  return new SignJWT({ sub: userId, jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${ttlMinutes}m`)
    .sign(secret);
}

export async function createSession(userId: string, opts: SessionOptions = {}): Promise<Session> {
  const ttl = opts.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const session: Session = {
    token: await signToken(userId, ttl),
    userId,
    expiresAt: addMinutes(new Date(), ttl),
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

export async function rotateSession(token: string): Promise<Session | undefined> {
  const current = getSession(token);
  if (!current) return undefined;
  const next = await createSession(current.userId);
  next.rotatedFrom = current.token;
  sessions.delete(current.token);
  return next;
}

export function endSession(token: string): void {
  sessions.delete(token);
}
