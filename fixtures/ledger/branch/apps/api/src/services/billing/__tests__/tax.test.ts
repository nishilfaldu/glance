import { it, expect } from "vitest";
import { applyTax, bracketTax } from "../tax";

it("applies the regional rate", () => {
  expect(applyTax(100, {})).toBe(8);
});

it("taxes each bracket at its own rate", () => {
  const brackets = [{ rate: 0.05, upTo: 1000 }, { rate: 0.12 }];
  expect(bracketTax(2000, brackets)).toBe(170);
});
