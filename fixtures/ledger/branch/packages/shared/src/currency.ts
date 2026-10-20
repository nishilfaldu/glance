export function toMinorUnits(amount: number, decimals = 2) {
  return Math.round(amount * 10 ** decimals);
}
