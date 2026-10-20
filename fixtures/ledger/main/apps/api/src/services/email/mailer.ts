import { send } from "../../lib/http";
import { logger } from "../../lib/logger";

const FROM = "billing@ledger.dev";

// Sends the invoice email with the PDF attached. Retries are handled by the mail provider.
export default async function sendInvoiceEmail(customerId: string, invoice: any, pdf: string) {
  const subject = `Your invoice ${invoice.id}`;
  logger.info({ customerId, invoiceId: invoice.id }, "sending invoice email");
  return send("POST", "https://mail.internal/send", {
    from: FROM,
    to: customerId,
    subject,
    attachments: [{ name: `${invoice.id}.pdf`, body: pdf }],
  });
}

export function unsubscribeLink(customerId: string) {
  return `https://ledger.dev/unsubscribe?c=${encodeURIComponent(customerId)}`;
}
