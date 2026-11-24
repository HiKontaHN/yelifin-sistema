import { isCatalogId } from "@/lib/public-catalog";

describe("identificador del catálogo público", () => {
  it("acepta un UUID válido", () => {
    expect(isCatalogId("8bd6f0d1-9ab8-4d03-9a85-1a82b18145a1")).toBe(true);
  });

  it.each([
    "1",
    "catalogo-1",
    "8bd6f0d1-9ab8-4d03-9a85",
    "8bd6f0d1-9ab8-0d03-9a85-1a82b18145a1",
  ])("rechaza identificadores iterables o mal formados: %s", (value) => {
    expect(isCatalogId(value)).toBe(false);
  });
});
