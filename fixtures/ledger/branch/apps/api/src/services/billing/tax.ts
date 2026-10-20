import { loadTaxConfig } from "../../lib/config";
import { ratesFor } from "./rates";

export function applyTax(amount: number, opts: { taxInclusive?: boolean }) {
  const config = loadTaxConfig();
  const brackets = ratesFor(config.region);
  if (opts.taxInclusive) return amount - amount / (1 + brackets[0].rate);
  return bracketTax(amount, brackets);
}

// Taxes each slice of the amount at its bracket's rate.
export function bracketTax(amount: number, brackets: { rate: number; upTo?: number }[], floor = 0): number {
  const [bracket, ...rest] = brackets;
  if (!bracket || amount <= floor) return 0;
  const top = Math.min(amount, bracket.upTo ?? Infinity);
  return (top - floor) * bracket.rate + bracketTax(amount, rest, top);
}
