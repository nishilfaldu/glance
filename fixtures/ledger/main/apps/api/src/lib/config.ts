import { withRetry } from "./retry";

function readConfig(name: string) {
  return JSON.parse(process.env[`CONFIG_${name.toUpperCase()}`] ?? "{}");
}

export function loadTaxConfig() {
  return readConfig("tax") as { region: string };
}
