import { toMinorUnits } from "@ledger/shared";
import { formatMoney } from "../lib/format";
import { TaxCell } from "./TaxCell";

export function InvoiceTable({ invoices, showTax }: { invoices: any[]; showTax?: boolean }) {
  return (
    <table>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id} data-cents={toMinorUnits(inv.total)}>
            <td>{inv.id}</td>
            {showTax && <TaxCell amount={inv.tax} inclusive={inv.taxInclusive} />}
            <td>{formatMoney(inv.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
