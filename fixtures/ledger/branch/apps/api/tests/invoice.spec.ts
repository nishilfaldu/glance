import { describe, it, expect } from "vitest";
import { buildInvoice } from "../src/services/billing/invoice";

describe("buildInvoice", () => {
  it("totals the lines", () => {
    const inv = buildInvoice("cus_1", [{ sku: "a", quantity: 2, unitPrice: 50 }]);
    expect(inv.subtotal).toBe(100);
  });

  it("keeps the total when prices include tax", () => {
    const inv = buildInvoice("cus_1", [{ sku: "a", quantity: 1, unitPrice: 108 }], { taxInclusive: true });
    expect(inv.total).toBe(108);
    expect(inv.tax).toBeCloseTo(8);
  });
});
