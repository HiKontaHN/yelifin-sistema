import { endOfMonth, format, startOfMonth } from "date-fns";
import { isCalendarDate, toCalendarDate } from "@/lib/date-utils";

type DateRange = { from: string; to: string };
type EventDates = { start_date?: string | null; end_date?: string | null; starts_at: string; ends_at: string };

export const ALL_EVENT_DATES: DateRange = { from: "", to: "" };

export function eventMonthRange(month: Date): DateRange {
  return { from: format(startOfMonth(month), "yyyy-MM-dd"), to: format(endOfMonth(month), "yyyy-MM-dd") };
}

export function readEventDateRange(params: Pick<URLSearchParams, "get">): DateRange | null {
  if (params.get("range") === "all") return ALL_EVENT_DATES;
  const from = params.get("from");
  const to = params.get("to");
  if (isCalendarDate(from) && isCalendarDate(to) && from <= to) return { from, to };

  const year = params.get("y");
  const month = params.get("m");
  if (year && /^\d{4}$/.test(year) && Number(year) >= 100
    && month !== null && /^(?:[0-9]|1[01])$/.test(month)) {
    return eventMonthRange(new Date(Number(year), Number(month), 1));
  }
  return null;
}

export function eventOverlapsDateRange(event: EventDates, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const start = toCalendarDate(event.start_date ?? event.starts_at);
  const end = toCalendarDate(event.end_date ?? event.ends_at);
  return (!range.to || start <= range.to) && (!range.from || end >= range.from);
}

export function defaultEventDateRange(events: EventDates[], currentMonth: DateRange): DateRange {
  if (events.some((event) => eventOverlapsDateRange(event, currentMonth))) return currentMonth;

  const latestEnd = events.reduce((latest, event) => {
    const end = toCalendarDate(event.end_date ?? event.ends_at);
    return end > latest ? end : latest;
  }, "");
  return latestEnd ? eventMonthRange(new Date(`${latestEnd}T12:00:00`)) : currentMonth;
}
