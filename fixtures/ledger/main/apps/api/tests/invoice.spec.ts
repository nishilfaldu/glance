import { describe, it, expect } from "vitest";
import { buildInvoice } from "../src/services/billing/invoice";

describe("buildInvoice", () => {
  it("totals the lines", () => {
    const inv = buildInvoice("cus_1", [{ sku: "a", quantity: 2, unitPrice: 50 }]);
    expect(inv.subtotal).toBe(100);
  });
});
