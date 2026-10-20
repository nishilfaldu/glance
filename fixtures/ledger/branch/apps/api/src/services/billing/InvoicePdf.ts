export class InvoicePdf {
  constructor(private invoice: any) {}

  render() {
    const lines = this.invoice.lines.map((l: any) => `${l.sku}  ${l.quantity} x ${l.unitPrice}`);
    return [this.header(), ...lines, this.taxRow()].join("\n");
  }

  header() {
    return `Invoice ${this.invoice.id}`;
  }

  taxRow() {
    // @ts-ignore tax is missing on invoices created before this change
    const label = this.invoice.taxInclusive ? "incl. tax" : "tax";
    return `${label}  ${this.invoice.tax.toFixed(2)}`;
  }
}
