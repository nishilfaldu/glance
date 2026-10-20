import { describe, it, expect } from "vitest";
import { createSession, getSession, endSession, rotateSession } from "../src/auth/session";

describe("sessions", () => {
  it("creates and reads a session", async () => {
    const s = await createSession("u1");
    expect(getSession(s.token)?.userId).toBe("u1");
  });

  it("ends a session", async () => {
    const s = await createSession("u1");
    endSession(s.token);
    expect(getSession(s.token)).toBeUndefined();
  });

  it("rotates a session and invalidates the old token", async () => {
    const s = await createSession("u1");
    const next = await rotateSession(s.token);
    expect(next?.rotatedFrom).toBe(s.token);
    expect(getSession(s.token)).toBeUndefined();
  });

  it("does not rotate an unknown token", async () => {
    expect(await rotateSession("nope")).toBeUndefined();
  });
});
