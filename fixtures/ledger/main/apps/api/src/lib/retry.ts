export function withRetry<T>(fn: () => T, attempts = 3): T {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (err) {
      last = err;
    }
  }
  throw last;
}
