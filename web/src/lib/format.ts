const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86400e3],
    ["month", 30 * 86400e3],
    ["day", 86400e3],
    ["hour", 3600e3],
    ["minute", 60e3],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return "just now"
}

export function absoluteTime(iso: string): string {
  return `${dtf.format(new Date(iso))} UTC`
}

export const RETENTION_DAYS = 30

export function daysLeft(deletedAt: string, retentionDays = RETENTION_DAYS, now = Date.now()): number {
  const elapsed = (now - new Date(deletedAt).getTime()) / 86400e3
  return Math.max(0, Math.ceil(retentionDays - elapsed))
}

export function shortId(id: string): string {
  return id.slice(0, 8)
}
