import { describe, it, expect } from "vitest";
import { createSession, getSession, endSession } from "../src/auth/session";

describe("sessions", () => {
  it("creates and reads a session", () => {
    const s = createSession("u1");
    expect(getSession(s.token)?.userId).toBe("u1");
  });

  it("ends a session", () => {
    const s = createSession("u1");
    endSession(s.token);
    expect(getSession(s.token)).toBeUndefined();
  });
});
