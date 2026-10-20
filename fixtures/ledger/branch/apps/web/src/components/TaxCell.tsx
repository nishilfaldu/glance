import { Badge } from "./ui/Badge";
import { formatMoney } from "@/lib/format";

export function TaxCell({ amount, inclusive }: { amount: number; inclusive: boolean }) {
  return (
    <td>
      {formatMoney(amount)}
      {inclusive && <Badge>incl.</Badge>}
    </td>
  );
}
