export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMinutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (Math.abs(diffMinutes) < 60) return relativeTime.format(diffMinutes, "minute");
  return relativeTime.format(Math.round(diffMinutes / 60), "hour");
}
