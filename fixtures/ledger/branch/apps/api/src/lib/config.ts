import { withRetry } from "./retry";

export const TAX_API_URL = process.env.TAX_API_URL ?? "https://tax.internal.ledger.dev";

function readConfig(name: string) {
  return JSON.parse(process.env[`CONFIG_${name.toUpperCase()}`] ?? "{}");
}

export function loadTaxConfig() {
  return (withRetry(() => readConfig("tax")) ?? { region: "US" }) as { region: string };
}
