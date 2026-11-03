/**
 * Date-only values and instants are deliberately different concepts here:
 *
 * - CalendarDate (YYYY-MM-DD) is used for accounting/business dates.
 * - Date/ISO timestamps are instants and are rendered in the organization's
 *   IANA timezone.
 *
 * Never turn a CalendarDate into a JavaScript Date just to send it to the API.
 */

export type CalendarDate = `${number}-${number}-${number}`;

export const DEFAULT_TIMEZONE = "UTC";
export const DEFAULT_LOCALE = "es-HN";

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== "string") return false;
  const match = CALENDAR_DATE_RE.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function datePartsInTimeZone(value: Date, timeZone: string): CalendarDate {
  const safeTimeZone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}` as CalendarDate;
}

export function instantToCalendarDate(
  value: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): CalendarDate {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Instante inválido");
  return datePartsInTimeZone(date, timeZone);
}

export function todayInTimeZone(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): CalendarDate {
  return datePartsInTimeZone(now, timeZone);
}

/**
 * Normalizes a database DATE or an instant to YYYY-MM-DD. A DATE string is
 * preserved byte-for-byte, preventing the Node process timezone from moving it.
 */
export function toCalendarDate(
  value: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): CalendarDate {
  if (typeof value === "string") {
    const prefix = value.slice(0, 10);
    if (isCalendarDate(prefix)) return prefix;
  }
  return instantToCalendarDate(value, timeZone);
}

/** Safe value for an <input type="date">. */
export function toLocalDateInput(
  value: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return toCalendarDate(value, timeZone);
}

export function addCalendarDays(value: string, days: number): CalendarDate {
  if (!isCalendarDate(value) || !Number.isInteger(days)) {
    throw new RangeError("Fecha o cantidad de días inválida");
  }
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10) as CalendarDate;
}

export function ageOnCalendarDate(dateOfBirth: string, onDate: string): number {
  if (!isCalendarDate(dateOfBirth) || !isCalendarDate(onDate)) {
    throw new RangeError("Fecha de nacimiento o fecha de cálculo inválida");
  }
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [year, month, day] = onDate.split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age;
}

export function formatCalendarDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  locale: string = DEFAULT_LOCALE,
): string {
  const date = toCalendarDate(value);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00.000Z`),
  );
}

export function formatInstant(
  value: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  locale: string = DEFAULT_LOCALE,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Instante inválido");
  const safeTimeZone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: safeTimeZone }).format(date);
}

export type SimpleEventStatus = "PLANNED" | "ACTIVE" | "COMPLETED";

export function computeEventStatus(
  startsAt: string | Date,
  endsAt: string | Date,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): SimpleEventStatus {
  const today = todayInTimeZone(timeZone, now);
  const start = toCalendarDate(startsAt, timeZone);
  const end = toCalendarDate(endsAt, timeZone);
  if (today < start) return "PLANNED";
  if (today <= end) return "ACTIVE";
  return "COMPLETED";
}
