import { calendarDateStartToUtc, getCalendarBounds, getUtcBounds } from "@/lib/date-bounds";

describe("date-bounds", () => {
  test("builds date-only day, month and year ranges", () => {
    expect(getCalendarBounds(new URLSearchParams("date=2026-11-03"), "America/Tegucigalpa"))
      .toEqual({ startDate: "2026-11-03", endDate: "2026-11-04" });
    expect(getCalendarBounds(new URLSearchParams("month=12&year=2026"), "UTC"))
      .toEqual({ startDate: "2026-12-01", endDate: "2027-01-01" });
    expect(getCalendarBounds(new URLSearchParams("year=2026"), "UTC"))
      .toEqual({ startDate: "2026-01-01", endDate: "2027-01-01" });
  });

  test("uses the organization timezone instead of a browser offset", () => {
    expect(calendarDateStartToUtc("2026-11-03", "America/Tegucigalpa").toISOString())
      .toBe("2026-11-03T06:00:00.000Z");
    expect(calendarDateStartToUtc("2026-11-03", "Asia/Tokyo").toISOString())
      .toBe("2026-11-02T15:00:00.000Z");
  });

  test("handles DST days without assuming 24 hours", () => {
    const spring = getUtcBounds(
      new URLSearchParams("date=2026-03-08"),
      "America/New_York",
    );
    expect(spring.startISO).toBe("2026-03-08T05:00:00.000Z");
    expect(spring.endISO).toBe("2026-03-09T04:00:00.000Z");

    const fall = getUtcBounds(
      new URLSearchParams("date=2026-11-01"),
      "America/New_York",
    );
    expect(fall.startISO).toBe("2026-11-01T04:00:00.000Z");
    expect(fall.endISO).toBe("2026-11-02T05:00:00.000Z");
  });
});
