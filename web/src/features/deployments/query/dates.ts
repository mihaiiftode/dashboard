import { TZDate } from "@date-fns/tz"
import { addDays, formatISO, startOfDay } from "date-fns"
import { z } from "zod"

const STORED_ZONE = "UTC"

const calendarDay = z.iso.date()

export type CalendarDay = z.infer<typeof calendarDay>

export const isCalendarDay = (value: string): boolean => calendarDay.safeParse(value).success

const startOfStoredDay = (day: CalendarDay): Date => startOfDay(new TZDate(day, STORED_ZONE))

const storedInstant = (at: Date): string => new Date(at.getTime()).toISOString()

export const startOfCalendarDay = (day: CalendarDay): string => storedInstant(startOfStoredDay(day))

export const startOfNextDay = (day: CalendarDay): string => storedInstant(addDays(startOfStoredDay(day), 1))

export const today = (): CalendarDay => formatISO(new TZDate(Date.now(), STORED_ZONE), { representation: "date" })
