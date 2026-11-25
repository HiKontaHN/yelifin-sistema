import { isCatalogId } from "@/lib/public-catalog";
import { parsePublicCatalogLink } from "@/lib/public-catalog-link";

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

describe("enlace del catálogo público", () => {
  it("acepta el nombre del negocio separado por guiones", () => {
    expect(parsePublicCatalogLink("Mi-Tienda-2")).toEqual({ id: null, slug: "mi-tienda-2" });
  });

  it("conserva los enlaces UUID", () => {
    const id = "8bd6f0d1-9ab8-4d03-9a85-1a82b18145a1";
    expect(parsePublicCatalogLink(id)).toEqual({ id, slug: null });
  });

  it.each(["", "mi tienda", "mi--tienda", "mi/tienda", "a".repeat(121)])(
    "rechaza enlaces con formato inválido: %s",
    (value) => expect(parsePublicCatalogLink(value)).toBeNull(),
  );
});
