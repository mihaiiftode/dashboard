import { tz, TZDate } from "@date-fns/tz"
import { addDays, format, isValid, parse } from "date-fns"

const CALENDAR_DAY = "yyyy-MM-dd"
const STORED_INSTANT = "yyyy-MM-dd'T'HH:mm:ss.SSS'000Z'"
const IN_STORED_ZONE = { in: tz("UTC") }
const UNUSED_REFERENCE = new Date(0)

export type CalendarDay = TZDate

export const parseCalendarDay = (value: string): CalendarDay | null => {
  const day = parse(value, CALENDAR_DAY, UNUSED_REFERENCE, IN_STORED_ZONE)
  return isValid(day) && format(day, CALENDAR_DAY) === value ? day : null
}

export const startOfCalendarDay = (day: CalendarDay): string => format(day, STORED_INSTANT)

export const startOfNextDay = (day: CalendarDay): string => format(addDays(day, 1), STORED_INSTANT)

export const today = (): string => format(new Date(), CALENDAR_DAY, IN_STORED_ZONE)
