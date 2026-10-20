export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMinutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (Math.abs(diffMinutes) < 1) return "just now";
  if (diffMinutes > 0) return `in ${diffMinutes} min`;
  return `${-diffMinutes} min ago`;
}
