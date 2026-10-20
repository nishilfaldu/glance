export class InvoicePdf {
  constructor(private invoice: any) {}

  render() {
    return [this.header(), ...this.invoice.lines.map((l: any) => `${l.sku}  ${l.quantity} x ${l.unitPrice}`)].join("\n");
  }

  header() {
    return `Invoice ${this.invoice.id}`;
  }
}
