import { ALL_EVENT_DATES, defaultEventDateRange, eventOverlapsDateRange, readEventDateRange } from "@/lib/event-date-range";

const event = (start: string, end: string) => ({ starts_at: start, ends_at: end });
const november = { from: "2026-11-01", to: "2026-11-30" };

it("incluye eventos de varios días que tocan un límite del rango", () => {
  expect(eventOverlapsDateRange(event("2026-10-30", "2026-11-01"), november)).toBe(true);
  expect(eventOverlapsDateRange(event("2026-11-30", "2026-12-02"), november)).toBe(true);
  expect(eventOverlapsDateRange(event("2026-10-20", "2026-10-31"), november)).toBe(false);
  expect(eventOverlapsDateRange(event("2026-12-01", "2026-12-02"), november)).toBe(false);
  expect(eventOverlapsDateRange(event("2026-12-01", "2026-12-02"), ALL_EVENT_DATES)).toBe(true);
});

it("usa las fechas de negocio cuando vienen con el evento", () => {
  expect(eventOverlapsDateRange({
    ...event("2026-12-01T02:00:00Z", "2026-12-01T03:00:00Z"),
    start_date: "2026-11-30",
    end_date: "2026-11-30",
  }, november)).toBe(true);
});

it("abre el mes más reciente con eventos si el actual está vacío", () => {
  expect(defaultEventDateRange([event("2026-09-30", "2026-10-02")], november)).toEqual({
    from: "2026-10-01", to: "2026-10-31",
  });
  expect(defaultEventDateRange([event("2026-10-30", "2026-11-02")], november)).toEqual(november);
  expect(defaultEventDateRange([], november)).toEqual(november);
});

it("restaura rangos personalizados, Todos y enlaces antiguos de mes y año", () => {
  expect(readEventDateRange(new URLSearchParams("from=2026-11-01&to=2026-11-30"))).toEqual(november);
  expect(readEventDateRange(new URLSearchParams("range=all"))).toEqual(ALL_EVENT_DATES);
  expect(readEventDateRange(new URLSearchParams("y=2026&m=10"))).toEqual(november);
  expect(readEventDateRange(new URLSearchParams("from=2026-11-31&to=2026-12-01"))).toBeNull();
});
