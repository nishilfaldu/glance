import { markPaid } from "../services/billing/invoice";

export async function stripeWebhook(req: any) {
  const event = req.body;
  if (event.type === "invoice.paid") {
    await markPaid(event.data.invoiceId, event.data.amountPaid);
  }
}
