const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Una cantidad nula identifica un servicio, que no descuenta inventario.
export type CatalogStock = Partial<Record<string, number | null>>;

export type CatalogStockEvent =
  | { type: "stock"; stock: CatalogStock }
  | { type: "heartbeat" }
  | { type: "unavailable" };

export function isCatalogId(value: string) {
  return UUID_PATTERN.test(value);
}

export function getCatalogItemAvailability(item: { id: string; variants: { id: string }[] }, stock: CatalogStock) {
  const base: number | null | undefined = stock[item.id];
  if (base == null) return base;
  return item.variants.reduce((quantity, variant) => quantity + (stock[variant.id] ?? 0), base);
}

export function isCatalogStockEvent(value: unknown): value is CatalogStockEvent {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "heartbeat" || value.type === "unavailable") return true;
  if (value.type !== "stock" || !("stock" in value) || !value.stock || typeof value.stock !== "object") return false;

  return !Array.isArray(value.stock) && Object.entries(value.stock).every(([id, quantity]) =>
    isCatalogId(id) && (quantity === null || (Number.isSafeInteger(quantity) && quantity >= 0)),
  );
}
