import { formatMoney } from "../lib/format";

export function InvoiceTable({ invoices }: { invoices: any[] }) {
  return (
    <table>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id}>
            <td>{inv.id}</td>
            <td>{formatMoney(inv.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
