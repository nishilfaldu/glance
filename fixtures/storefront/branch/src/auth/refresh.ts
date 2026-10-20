import { getSession, rotateSession, type Session } from "./session";
import { addMinutes } from "../utils/date";

const REFRESH_WINDOW_MINUTES = 5;

export async function refreshIfExpiring(token: string): Promise<Session | null> {
  try {
    const session = getSession(token);
    if (!session) return null;
    const refreshAt = addMinutes(session.expiresAt, -REFRESH_WINDOW_MINUTES);
    if (new Date() < refreshAt) return session;
    return (await rotateSession(token)) ?? null;
  } catch {
    return null;
  }
}
