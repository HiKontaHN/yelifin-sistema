import { addCalendarDays, todayInTimeZone, type CalendarDate } from "@/lib/date-utils";

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateValue(year: number, month: number, day: number): CalendarDate {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as CalendarDate;
}

/** First business date of the current credit-card billing cycle. */
export function getCreditCardCycleStart(
  closingDay: number | null,
  timeZone: string,
  now: Date = new Date(),
): CalendarDate {
  const today = todayInTimeZone(timeZone, now);
  const [year, month, day] = today.split("-").map(Number);
  if (!closingDay) return dateValue(year, month, 1);

  const cutThisMonth = Math.min(closingDay, daysInMonth(year, month));
  if (day > cutThisMonth) {
    return addCalendarDays(dateValue(year, month, cutThisMonth), 1);
  }

  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousCut = Math.min(closingDay, daysInMonth(previousYear, previousMonth));
  return addCalendarDays(dateValue(previousYear, previousMonth, previousCut), 1);
}
