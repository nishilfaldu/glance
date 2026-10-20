import { buildInvoice } from "../services/billing/invoice";
import { InvoicePdf } from "../services/billing/InvoicePdf";
import sendInvoiceEmail from "../services/email/mailer";
import { db } from "../lib/db";

export async function createInvoice(body: any) {
  const invoice = buildInvoice(body.customerId, body.lines);
  await db.invoices.insert(invoice);
  const pdf = new InvoicePdf(invoice).render();
  await sendInvoiceEmail(body.customerId, invoice, pdf);
  return invoice;
}

export async function getInvoice(id: string) {
  return db.invoices.find(id);
}
