import { loadTaxConfig } from "../../lib/config";
import { ratesFor } from "./rates";

export function applyTax(amount: number, opts: { taxInclusive?: boolean }) {
  const config = loadTaxConfig();
  return amount * ratesFor(config.region)[0].rate;
}
