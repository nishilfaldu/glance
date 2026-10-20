import { InvoiceTable } from "../components/InvoiceTable";
import { useInvoices } from "../hooks/useInvoices";

export default function InvoicesPage() {
  const { data } = useInvoices();
  return <InvoiceTable invoices={data} />;
}
