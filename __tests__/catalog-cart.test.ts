import {
  buildCatalogCartLines, buildCatalogMessage, canShareCatalogCart, changeCatalogQuantity,
  getInstagramCatalogChat, getWhatsAppCatalogShare, readCatalogCart,
} from "@/lib/catalog-cart";
import { getCatalogItemAvailability, isCatalogStockEvent } from "@/lib/catalog-stock";
import type { PublicCatalogItem } from "@/lib/public-catalog";

const product = "a0000000-0000-4000-8000-000000000001";
const variant = "a0000000-0000-4000-8000-000000000002";
const service = "a0000000-0000-4000-8000-000000000003";
const items: PublicCatalogItem[] = [
  {
    id: product, name: "Camiseta", description: null, price: 200, image_url: null, is_service: false,
    variants: [{ id: variant, variant_name: "Talla M", price: 225, image_url: null }],
  },
  { id: service, name: "Estampado", description: null, price: 100, image_url: null, is_service: true, variants: [] },
];

describe("carrito de consultas del catálogo", () => {
  it("acepta únicamente cantidades enteras y referencias públicas al recuperar el carrito", () => {
    expect(readCatalogCart(JSON.stringify({ [product]: 2, [variant]: 1.5, 1: 3, [service]: -1 })))
      .toEqual({ [product]: 2 });
    expect(readCatalogCart("{")).toEqual({});
  });

  it("mantiene cantidades por variante y evita agregar más del inventario disponible", () => {
    const cart = changeCatalogQuantity({}, variant, 2, 2);
    expect(changeCatalogQuantity(cart, variant, 3, 2)).toBe(cart);
    expect(changeCatalogQuantity(cart, variant, 3, undefined)).toBe(cart);
    expect(changeCatalogQuantity(cart, product, 1, 4)).toEqual({ [variant]: 2, [product]: 1 });
    expect(changeCatalogQuantity(cart, variant, 0, 0)).toEqual({});
  });

  it("solicita ajustar la lista si cae el stock y mantiene los servicios sin límite de inventario", () => {
    const cart = changeCatalogQuantity({ [variant]: 3 }, service, 2, null);
    const stock = { [product]: 0, [variant]: 1, [service]: null };
    expect(canShareCatalogCart(buildCatalogCartLines(items, cart, stock))).toBe(false);
    const adjusted = changeCatalogQuantity(cart, variant, 1, stock[variant]);
    expect(canShareCatalogCart(buildCatalogCartLines(items, adjusted, stock))).toBe(true);
    expect(canShareCatalogCart(buildCatalogCartLines(items, adjusted, { [service]: null }))).toBe(false);
  });

  it("suma el inventario de la presentación base y las variantes", () => {
    expect(getCatalogItemAvailability(items[0], { [product]: 2, [variant]: 3 })).toBe(5);
    expect(getCatalogItemAvailability(items[0], { [product]: 0 })).toBe(0);
    expect(getCatalogItemAvailability(items[1], { [service]: null })).toBeNull();
  });

  it("genera la consulta con saludo, nombres, variantes y cantidades", () => {
    const lines = buildCatalogCartLines(items, { [variant]: 2, [service]: 1 }, {
      [product]: 0, [variant]: 3, [service]: null,
    });
    const message = buildCatalogMessage(lines);
    expect(message).toContain("Hola, vengo de tu catálogo de HiKonta.");
    expect(message).toContain("2 × Camiseta (Talla M)");
    expect(message).toContain("1 × Estampado");
    expect(message).not.toContain(product);
  });

  it("prepara WhatsApp con el mensaje y abre la conversación de Instagram para pegarlo", () => {
    const message = "Hola, vengo de tu catálogo de HiKonta.\n• 2 × Camiseta";
    const whatsapp = getWhatsAppCatalogShare("https://api.whatsapp.com/send?phone=50499999999", message);
    expect(whatsapp?.copy).toBe(false);
    const whatsappUrl = new URL(whatsapp!.url);
    expect(whatsappUrl.pathname).toBe("/50499999999");
    expect(whatsappUrl.searchParams.get("text")).toBe(message);
    expect(getWhatsAppCatalogShare("https://wa.me/message/CODIGO123", message)).toEqual({
      url: "https://wa.me/message/CODIGO123", copy: true,
    });
    expect(getInstagramCatalogChat("https://www.instagram.com/tienda/")).toEqual({
      url: "https://ig.me/m/tienda", handle: "tienda",
    });
    expect(getInstagramCatalogChat("https://ig.me/m/tienda")?.url).toBe("https://ig.me/m/tienda");
    expect(getInstagramCatalogChat(null)).toBeNull();
    expect(getWhatsAppCatalogShare(null, message)).toBeNull();
  });

  it("ignora eventos de inventario con identificadores o cantidades inválidas", () => {
    expect(isCatalogStockEvent({ type: "stock", stock: { [product]: 0, [service]: null } })).toBe(true);
    expect(isCatalogStockEvent({ type: "stock", stock: { [product]: -1 } })).toBe(false);
    expect(isCatalogStockEvent({ type: "stock", stock: { 1: 9 } })).toBe(false);
  });
});
