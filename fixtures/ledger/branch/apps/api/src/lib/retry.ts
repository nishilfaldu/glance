export function withRetry<T>(fn: () => T, attempts = 3): T | null {
  for (let i = 0; i < attempts - 1; i++) {
    try {
      return fn();
    } catch {
      continue;
    }
  }
  try {
    return fn();
  } catch {
    return null;
  }
}
