export function page<T>(items: T[], n: number, size = 20) {
  return items.slice(n * size, (n + 1) * size);
}
