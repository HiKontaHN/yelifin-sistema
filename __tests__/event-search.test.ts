import { filterEventsBySearch } from "@/lib/event-search";

const events = [
  { id: 1, name: "Feria de Café", location: "Santa Lucía" },
  { id: 2, name: "Mercado de noviembre", location: "Tegucigalpa" },
  { id: 3, name: "Feria de artesanías", location: null },
];

it("encuentra coincidencias parciales por nombre o ubicación sin importar las tildes", () => {
  expect(filterEventsBySearch(events, "  CAFE ")).toEqual([events[0]]);
  expect(filterEventsBySearch(events, "santa lucia")).toEqual([events[0]]);
  expect(filterEventsBySearch(events, "tegu")).toEqual([events[1]]);
});

it("conserva el orden y admite ubicaciones vacías", () => {
  expect(filterEventsBySearch(events, "feria")).toEqual([events[0], events[2]]);
  expect(filterEventsBySearch(events, "comayagua")).toEqual([]);
  expect(filterEventsBySearch(events, "  ")).toEqual(events);
});
