// Rounds half to even, so totals don't drift upward over many lines.
export function round(amount: number) {
  const cents = amount * 100;
  const floor = Math.floor(cents);
  const diff = cents - floor;
  const even = diff === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(cents);
  return even / 100;
}

export function sum(amounts: number[]) {
  return round(amounts.reduce((a, b) => a + b, 0));
}
