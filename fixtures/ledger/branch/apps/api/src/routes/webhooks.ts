import { markPaid } from "../services/billing/invoice";
import { metrics } from "../lib/metrics";

export async function stripeWebhook(req: any) {
  const event = req.body;
  if (event.type === "invoice.paid") {
    await markPaid(event.data.invoice, event.data.amountPaid);
    event.data.lines.forEach(recordLine);
  }
}

function recordLine(line: { sku: string; tax: number }) {
  metrics.increment("invoice.line_tax", { sku: line.sku, tax: String(line.tax) });
}
