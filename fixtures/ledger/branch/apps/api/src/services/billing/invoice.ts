import * as money from "../../lib/money";
import { applyTax } from "./tax";
import { newId } from "../../lib/ids";

export type Line = { sku: string; quantity: number; unitPrice: number };

export function buildInvoice(customerId: string, lines: Line[], opts: { taxInclusive?: boolean } = {}) {
  const { subtotal, tax } = totals(lines, opts);
  const total = opts.taxInclusive ? subtotal : subtotal + tax;
  return { id: newId("inv"), customerId, lines, subtotal, tax, total: money.round(total), taxInclusive: !!opts.taxInclusive, status: "open" };
}

function totals(lines: Line[], opts: { taxInclusive?: boolean }) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  return { subtotal, tax: applyTax(subtotal, opts) };
}

export function markPaid(invoice: any, amountPaid: number) {
  const paid = money.round(amountPaid);
  return { ...invoice, status: paid >= invoice.total ? "paid" : "partial" };
}
