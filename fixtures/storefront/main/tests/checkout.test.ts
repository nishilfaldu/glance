import { describe, it, expect } from "vitest";
import { createSession } from "../src/auth/session";
import { handleCheckout } from "../src/api/checkout";

describe("checkout", () => {
  it("charges an authenticated user", async () => {
    const s = createSession("u1");
    const res = await handleCheckout({ token: s.token, cartId: "c1", amountCents: 500 });
    expect(res.status).toBe(200);
    expect(res.body.receiptId).toBe("rcpt_c1_u1");
  });

  it("rejects an unknown token", async () => {
    const res = await handleCheckout({ token: "nope", cartId: "c1", amountCents: 500 });
    expect(res.status).toBe(401);
  });
});
