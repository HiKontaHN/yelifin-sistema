import {
  addCalendarDays,
  ageOnCalendarDate,
  computeEventStatus,
  formatInstant,
  instantToCalendarDate,
  isCalendarDate,
  isValidTimeZone,
  todayInTimeZone,
  toCalendarDate,
} from "@/lib/date-utils";

describe("date-utils", () => {
  test("validates real calendar dates and IANA timezones", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2023-02-29")).toBe(false);
    expect(isValidTimeZone("America/Tegucigalpa")).toBe(true);
    expect(isValidTimeZone("Not/A_Timezone")).toBe(false);
  });

  test("preserves a database DATE without applying a timezone", () => {
    expect(toCalendarDate("2026-11-03")).toBe("2026-11-03");
    expect(toCalendarDate("2026-11-03T00:00:00.000Z", "America/Tegucigalpa"))
      .toBe("2026-11-03");
  });

  test("maps one instant to the organization's calendar day", () => {
    const instant = "2026-11-03T03:00:00.000Z";
    expect(instantToCalendarDate(instant, "America/Tegucigalpa")).toBe("2026-11-02");
    expect(instantToCalendarDate(instant, "Asia/Tokyo")).toBe("2026-11-03");
  });

  test("gets today in a timezone and crosses year boundaries", () => {
    const now = new Date("2027-01-01T03:00:00.000Z");
    expect(todayInTimeZone("America/Tegucigalpa", now)).toBe("2026-12-31");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("formats instants and calculates age in the selected calendar day", () => {
    const instant = "2027-01-01T03:00:00.000Z";
    expect(formatInstant(instant, "America/Tegucigalpa", {
      year: "numeric", month: "2-digit", day: "2-digit",
    })).toBe("31/12/2026");
    expect(ageOnCalendarDate("2008-11-04", "2026-11-03")).toBe(17);
    expect(ageOnCalendarDate("2008-11-04", "2026-11-04")).toBe(18);
  });

  test("computes event status from calendar dates", () => {
    const now = new Date("2026-11-03T23:30:00.000Z");
    expect(computeEventStatus("2026-11-03", "2026-11-03", now, "America/Tegucigalpa"))
      .toBe("ACTIVE");
    expect(computeEventStatus("2026-11-04", "2026-11-05", now, "America/Tegucigalpa"))
      .toBe("PLANNED");
  });
});
