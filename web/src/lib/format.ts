import { TZDate } from "@date-fns/tz"
import { format, formatDistanceStrict } from "date-fns"

const ABSOLUTE_PATTERN = "d MMM yyyy, HH:mm"

export function relativeTime(iso: string, now = Date.now()): string {
  return formatDistanceStrict(new Date(iso), new Date(now), { addSuffix: true })
}

export function absoluteTime(iso: string): string {
  return `${format(new TZDate(iso, "UTC"), ABSOLUTE_PATTERN)} UTC`
}

export function shortId(id: string): string {
  return id.slice(0, 8)
}
