import { z } from "zod";
import { buildInvoice } from "../services/billing/invoice";
import { InvoicePdf } from "../services/billing/InvoicePdf";
import sendInvoiceEmail from "../services/email/sendEmail";
import { db } from "../lib/db";

const InvoiceInput = z.object({
  customerId: z.string(),
  lines: z.array(z.object({ sku: z.string(), quantity: z.number(), unitPrice: z.number() })),
  taxInclusive: z.boolean().default(false),
});

export async function createInvoice(body: unknown) {
  const input = InvoiceInput.parse(body);
  const invoice = buildInvoice(input.customerId, input.lines, { taxInclusive: input.taxInclusive });
  await db.invoices.insert(invoice);
  const pdf = new InvoicePdf(invoice).render();
  await sendInvoiceEmail(input.customerId, invoice, pdf);
  return invoice;
}

export async function previewInvoice(body: unknown) {
  const input = InvoiceInput.parse(body);
  return buildInvoice(input.customerId, input.lines, { taxInclusive: input.taxInclusive });
}

export async function getInvoice(id: string) {
  return db.invoices.find(id);
}
