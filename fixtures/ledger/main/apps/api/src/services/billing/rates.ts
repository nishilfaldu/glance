const RATES: Record<string, { rate: number; upTo?: number }[]> = {
  US: [{ rate: 0.08 }],
  DE: [{ rate: 0.19 }],
  IN: [{ rate: 0.05, upTo: 1000 }, { rate: 0.12, upTo: 10000 }, { rate: 0.18 }],
};

export function ratesFor(region: string) {
  return RATES[region] ?? RATES.US;
}
