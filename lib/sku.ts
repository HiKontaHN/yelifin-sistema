// lib/sku.ts
// Sugerencia de SKUs de variantes con verificación de disponibilidad.
//
// Convención: las variantes se numeran a partir del SKU del producto padre:
// V0-001 → V0-001-01, V0-001-02, ... Se rellenan los huecos: si -01 está
// ocupado pero -02 no, se sugiere -02.

/** Prefijo base para variantes: el SKU del producto o P{id} si no tiene. */
export function variantSkuBase(productSku: string | null | undefined, productId: number): string {
  return productSku?.trim() || `P${productId}`;
}

/**
 * Devuelve los próximos `count` SKUs de variante disponibles para el
 * producto, saltando los ya ocupados en la organización.
 * `exclude` permite reservar SKUs ya asignados en la misma operación
 * (p. ej. el de la variante base recién generada).
 */
export async function nextVariantSkus(
  sql: any,
  orgId: number,
  baseSku: string,
  count: number,
  exclude: string[] = []
): Promise<string[]> {
  const taken = await sql`
    SELECT sku FROM product_variants
    WHERE org_id = ${orgId} AND sku LIKE ${baseSku + "-%"}
  `;
  const used = new Set<string>([
    ...taken.map((r: any) => String(r.sku)),
    ...exclude,
  ]);

  const out: string[] = [];
  for (let n = 1; out.length < count && n < 1000; n++) {
    const candidate = `${baseSku}-${String(n).padStart(2, "0")}`;
    if (!used.has(candidate)) out.push(candidate);
  }
  return out;
}

/** true si ningún otro registro de la organización usa ese SKU de variante. */
export async function isVariantSkuAvailable(
  sql: any,
  orgId: number,
  sku: string
): Promise<boolean> {
  const [conflict] = await sql`
    SELECT id FROM product_variants
    WHERE org_id = ${orgId} AND sku = ${sku}
    LIMIT 1
  `;
  return !conflict;
}

// ── Productos ──────────────────────────────────────────────────────────
// Convención: iniciales del nombre + secuencia de 3 dígitos:
// "Peluche Hello Kitty" → PHK-001, PHK-002, ...

/** Prefijo de SKU a partir del nombre del producto (máx. 4 iniciales). */
export function skuPrefixFromName(name: string): string {
  const prefix = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
  return prefix || "PRD";
}

/**
 * Devuelve los próximos `count` SKUs de producto disponibles con el
 * prefijo dado, saltando los ya ocupados en la organización.
 */
export async function nextProductSkus(
  sql: any,
  orgId: number,
  prefix: string,
  count: number
): Promise<string[]> {
  const taken = await sql`
    SELECT sku FROM products
    WHERE org_id = ${orgId} AND sku LIKE ${prefix + "-%"}
  `;
  const used = new Set<string>(taken.map((r: any) => String(r.sku)));

  const out: string[] = [];
  for (let n = 1; out.length < count && n < 1000; n++) {
    const candidate = `${prefix}-${String(n).padStart(3, "0")}`;
    if (!used.has(candidate)) out.push(candidate);
  }
  return out;
}

/** true si ningún otro producto de la organización usa ese SKU. */
export async function isProductSkuAvailable(
  sql: any,
  orgId: number,
  sku: string
): Promise<boolean> {
  const [conflict] = await sql`
    SELECT id FROM products
    WHERE org_id = ${orgId} AND sku = ${sku}
    LIMIT 1
  `;
  return !conflict;
}
