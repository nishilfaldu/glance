export function formatMoney(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
