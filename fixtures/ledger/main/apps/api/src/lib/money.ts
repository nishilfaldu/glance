export function round(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function sum(amounts: number[]) {
  return round(amounts.reduce((a, b) => a + b, 0));
}
