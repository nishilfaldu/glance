import { it, expect } from "vitest";
import { applyTax } from "../tax";

it("applies the regional rate", () => {
  expect(applyTax(100, {})).toBe(8);
  expect(applyTax(0, {})).toBe(0);
});
