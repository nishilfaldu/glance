import * as money from "../../lib/money";
import { applyTax } from "./tax";
import { newId } from "../../lib/ids";

export type Line = { sku: string; quantity: number; unitPrice: number };

export function buildInvoice(customerId: string, lines: Line[]) {
  const { subtotal, tax } = totals(lines, {});
  return { id: newId("inv"), customerId, lines, subtotal, tax, total: money.round(subtotal + tax), status: "open" };
}

function totals(lines: Line[], opts: { taxInclusive?: boolean }) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  return { subtotal, tax: applyTax(subtotal, opts) };
}

export function markPaid(invoice: any, amountPaid: number) {
  return { ...invoice, status: amountPaid >= invoice.total ? "paid" : "partial" };
}
