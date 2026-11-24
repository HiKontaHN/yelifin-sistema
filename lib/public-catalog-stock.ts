import { neon } from "@neondatabase/serverless";

import { isCatalogId, type CatalogStock } from "@/lib/catalog-stock";

export async function findPublicCatalogOrganization(catalogId: string): Promise<string | null> {
  if (!isCatalogId(catalogId)) return null;
  const sql = neon(process.env.DATABASE_URL!);
  const [org] = await sql`
    SELECT id FROM organizations
    WHERE catalog_public_id = ${catalogId}::uuid AND is_active = TRUE
  `;
  return org ? String(org.id) : null;
}

export async function readPublicCatalogStock(catalogId: string): Promise<CatalogStock | null> {
  if (!isCatalogId(catalogId)) return null;
  const sql = neon(process.env.DATABASE_URL!);
  const [result] = await sql`
    WITH public_org AS (
      SELECT id FROM organizations
      WHERE catalog_public_id = ${catalogId}::uuid AND is_active = TRUE
    ),
    published AS (
      SELECT p.id, p.org_id, p.catalog_item_id, p.is_service
      FROM public_org o
      JOIN organization_catalog_items c ON c.org_id = o.id
      JOIN products p ON p.org_id = c.org_id AND p.id = c.product_id
      WHERE p.is_active = TRUE
    ),
    available AS (
      SELECT b.product_id, b.variant_id, SUM(b.qty_available) AS quantity
      FROM inventory_batches b
      JOIN published p ON p.org_id = b.org_id AND p.id = b.product_id
      JOIN warehouses w ON w.id = b.warehouse_id AND w.org_id = b.org_id AND w.is_active = TRUE
      WHERE b.qty_available > 0 AND p.is_service IS NOT TRUE
      GROUP BY b.product_id, b.variant_id
    ),
    options AS (
      SELECT p.catalog_item_id, p.id AS product_id, NULL::bigint AS variant_id, p.is_service
      FROM published p
      UNION ALL
      SELECT v.catalog_item_id, p.id, v.id, p.is_service
      FROM published p
      JOIN product_variants v ON v.org_id = p.org_id AND v.product_id = p.id AND v.is_active = TRUE
    )
    SELECT COALESCE(
      jsonb_object_agg(
        options.catalog_item_id,
        CASE WHEN options.is_service THEN NULL ELSE COALESCE(available.quantity, 0) END
      ) FILTER (WHERE options.catalog_item_id IS NOT NULL),
      '{}'::jsonb
    ) AS stock
    FROM public_org
    LEFT JOIN options ON TRUE
    LEFT JOIN available
      ON available.product_id = options.product_id
      AND available.variant_id IS NOT DISTINCT FROM options.variant_id
    GROUP BY public_org.id
  `;

  return result ? result.stock as CatalogStock : null;
}
