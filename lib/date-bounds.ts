import {
  addCalendarDays,
  DEFAULT_TIMEZONE,
  isCalendarDate,
  isValidTimeZone,
  todayInTimeZone,
  type CalendarDate,
} from "@/lib/date-utils";

export type CalendarBounds = { startDate: CalendarDate; endDate: CalendarDate };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function calendarDate(year: number, month: number, day: number): CalendarDate {
  const value = `${year}-${pad(month)}-${pad(day)}`;
  if (!isCalendarDate(value)) throw new RangeError("Período inválido");
  return value;
}

/** Returns an inclusive start and exclusive end using calendar dates only. */
export function getCalendarBounds(
  params: URLSearchParams,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): CalendarBounds {
  const date = params.get("date");
  const rawMonth = params.get("month");
  const rawYear = params.get("year");

  if (date !== null) {
    if (!isCalendarDate(date)) throw new RangeError("Fecha inválida");
    return { startDate: date, endDate: addCalendarDays(date, 1) };
  }

  const year = rawYear === null ? null : Number(rawYear);
  const month = rawMonth === null ? null : Number(rawMonth);
  if (year !== null && (!Number.isInteger(year) || year < 1 || year > 9998)) {
    throw new RangeError("Año inválido");
  }
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new RangeError("Mes inválido");
  }

  if (year !== null && month !== null) {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
      startDate: calendarDate(year, month, 1),
      endDate: calendarDate(nextYear, nextMonth, 1),
    };
  }

  if (year !== null) {
    return {
      startDate: calendarDate(year, 1, 1),
      endDate: calendarDate(year + 1, 1, 1),
    };
  }

  const today = todayInTimeZone(timeZone, now);
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  return {
    startDate: calendarDate(currentYear, currentMonth, 1),
    endDate: calendarDate(nextYear, nextMonth, 1),
  };
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values: Record<string, number> = {};
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values as ZonedParts;
}

/** Converts local midnight in an IANA timezone to its UTC instant. */
export function calendarDateStartToUtc(date: string, timeZone: string): Date {
  if (!isCalendarDate(date)) throw new RangeError("Fecha inválida");
  if (!isValidTimeZone(timeZone)) throw new RangeError("Zona horaria inválida");
  const [year, month, day] = date.split("-").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = desiredAsUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const correction = desiredAsUtc - representedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

/**
 * UTC bounds for legacy timestamp columns. The organization timezone is
 * supplied by the server; browser tz_offset is intentionally ignored.
 */
export function getUtcBounds(
  params: URLSearchParams,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): { startISO: string; endISO: string } {
  const { startDate, endDate } = getCalendarBounds(params, timeZone, now);
  return {
    startISO: calendarDateStartToUtc(startDate, timeZone).toISOString(),
    endISO: calendarDateStartToUtc(endDate, timeZone).toISOString(),
  };
}
