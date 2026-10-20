import { createInvoice, getInvoice, previewInvoice } from "./routes/invoices";
import { stripeWebhook } from "./routes/webhooks";

export const routes = {
  "POST /invoices": (req: any) => createInvoice(req.body),
  "GET /invoices/:id": (req: any) => getInvoice(req.params.id),
  "POST /invoices/preview": (req: any) => previewInvoice(req.body),
  "POST /webhooks/stripe": (req: any) => stripeWebhook(req),
};
