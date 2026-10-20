import { formatRelative } from "../utils/date";

export function orderPlacedLabel(placedAt: Date): string {
  return `Placed ${formatRelative(placedAt)}`;
}
