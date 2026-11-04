import { getCreditCardCycleStart } from "@/lib/credit-card-cycle";

describe("getCreditCardCycleStart", () => {
  test("uses the organization day and clamps short months", () => {
    const now = new Date("2026-03-01T03:00:00.000Z");
    expect(getCreditCardCycleStart(31, "America/Tegucigalpa", now)).toBe("2026-02-01");
    expect(getCreditCardCycleStart(null, "Asia/Tokyo", now)).toBe("2026-03-01");
  });

  test("starts the next cycle on the day after closing", () => {
    const now = new Date("2026-11-20T18:00:00.000Z");
    expect(getCreditCardCycleStart(15, "America/Tegucigalpa", now)).toBe("2026-11-16");
  });
});
