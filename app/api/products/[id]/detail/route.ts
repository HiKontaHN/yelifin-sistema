// app/api/products/[id]/detail/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canView');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const productId = Number(id);

    if (isNaN(productId)) return createErrorResponse("ID inválido", 400);

    // ── 1. Base product ──────────────────────────────────────────────
    const [product] = await sql`
      SELECT
        p.id,
        p.name,
        p.description,
        p.sku,
        p.barcode,
        p.price,
        p.image_url,
        p.is_active,
        p.is_service,
        p.created_at
      FROM products p
      WHERE p.id     = ${productId}
        AND p.org_id = ${orgId}
    `;

    if (!product) return createErrorResponse("Producto no encontrado", 404);

    // ── 2. Total stock ───────────────────────────────────────────────
    const [stockRow] = await sql`
      SELECT COALESCE(SUM(qty_available), 0) AS total_stock
      FROM inventory_batches
      WHERE product_id = ${productId}
        AND org_id     = ${orgId}
    `;

    // ── 3. avg_cost and last_cost (base product, no variant) ─────────
    const [costRow] = await sql`
      SELECT
        CASE
          WHEN SUM(qty_available) > 0
          THEN SUM(unit_cost * qty_available) / SUM(qty_available)
          ELSE 0
        END AS avg_cost
      FROM inventory_batches
      WHERE product_id = ${productId}
        AND org_id     = ${orgId}
        AND variant_id IS NULL
        AND qty_available > 0
    `;

    const [lastCostRow] = await sql`
      SELECT unit_cost AS last_cost
      FROM inventory_batches
      WHERE product_id = ${productId}
        AND org_id     = ${orgId}
        AND variant_id IS NULL
      ORDER BY received_at DESC
      LIMIT 1
    `;

    // ── 4. Variants with stock and avg_cost ──────────────────────────
    const variants = await sql`
      SELECT
        pv.id,
        pv.variant_name,
        pv.sku,
        pv.price_override,
        pv.image_url,
        pv.is_active,
        COALESCE(SUM(ib.qty_available), 0) AS stock,
        CASE
          WHEN SUM(ib.qty_available) > 0
          THEN SUM(ib.unit_cost * ib.qty_available) / SUM(ib.qty_available)
          ELSE 0
        END AS avg_cost
      FROM product_variants pv
      LEFT JOIN inventory_batches ib
        ON  ib.variant_id = pv.id
        AND ib.org_id     = ${orgId}
        AND ib.qty_available > 0
      WHERE pv.product_id = ${productId}
        AND pv.org_id     = ${orgId}
      GROUP BY pv.id, pv.variant_name, pv.sku, pv.price_override, pv.image_url, pv.is_active
      ORDER BY pv.id
    `;

    // ── 5. Last 8 batches ────────────────────────────────────────────
    const batches = await sql`
      SELECT
        ib.id,
        ib.qty_in,
        ib.qty_available,
        ib.unit_cost,
        ib.received_at,
        ib.variant_id,
        pv.variant_name
      FROM inventory_batches ib
      LEFT JOIN product_variants pv
        ON  pv.id     = ib.variant_id
        AND pv.org_id = ${orgId}
      WHERE ib.product_id = ${productId}
        AND ib.org_id     = ${orgId}
      ORDER BY ib.received_at DESC
      LIMIT 8
    `;

    // ── 5b. Cost history for chart (all batches with unit_cost, ASC) ──
    const costHistory = await sql`
      SELECT
        ib.id,
        ib.qty_in,
        ib.unit_cost,
        ib.received_at,
        ib.variant_id,
        pv.variant_name
      FROM inventory_batches ib
      LEFT JOIN product_variants pv
        ON  pv.id     = ib.variant_id
        AND pv.org_id = ${orgId}
      WHERE ib.product_id = ${productId}
        AND ib.org_id     = ${orgId}
        AND ib.unit_cost  > 0
      ORDER BY ib.received_at ASC
      LIMIT 50
    `;

    // ── 6. Sales statistics ──────────────────────────────────────────
    const [salesStats] = await sql`
      SELECT
        COALESCE(SUM(si.quantity), 0)                              AS total_units_sold,
        COALESCE(SUM(si.line_total), 0)                            AS total_revenue,
        COALESCE(SUM(si.line_total - si.unit_cost * si.quantity), 0) AS total_profit,
        CASE
          WHEN SUM(si.quantity) > 0
          THEN SUM(si.line_total) / SUM(si.quantity)
          ELSE 0
        END                                                         AS avg_unit_price,
        CASE
          WHEN SUM(si.quantity) > 0
          THEN SUM(si.unit_cost * si.quantity) / SUM(si.quantity)
          ELSE 0
        END                                                         AS avg_unit_cost,
        COUNT(DISTINCT si.sale_id)                                  AS sales_count,
        MAX(s.sold_at)                                              AS last_sold_at
      FROM sale_items si
      JOIN sales s
        ON  s.id     = si.sale_id
        AND s.org_id = ${orgId}
        AND s.status = 'COMPLETED'
      WHERE si.product_id = ${productId}
        AND si.org_id     = ${orgId}
    `;

    // ── 7. Purchase history (last 20 for chart) ─────────────────────
    const purchaseHistory = await sql`
      SELECT
        pb.purchased_at,
        COALESCE(s.name, pb.supplier_name) AS supplier_name,
        pbi.unit_cost,
        pbi.unit_cost_usd,
        pbi.quantity,
        pb.currency,
        pv.variant_name
      FROM purchase_batch_items pbi
      JOIN purchase_batches pb
        ON  pb.id     = pbi.purchase_batch_id
        AND pb.org_id = ${orgId}
      LEFT JOIN suppliers s
        ON  s.id     = pb.supplier_id
        AND s.org_id = ${orgId}
      LEFT JOIN product_variants pv
        ON  pv.id     = pbi.variant_id
        AND pv.org_id = ${orgId}
      WHERE pbi.product_id = ${productId}
        AND pbi.org_id     = ${orgId}
      ORDER BY pb.purchased_at DESC
      LIMIT 20
    `;

    // ── 8. Last 10 inventory movements ──────────────────────────────
    const movements = await sql`
      SELECT
        im.id,
        im.movement_type,
        im.quantity,
        im.reference_type,
        im.reference_id,
        im.variant_id,
        pv.variant_name,
        im.created_at,
        s.sale_number,
        pb.public_id AS purchase_public_id
      FROM inventory_movements im
      LEFT JOIN product_variants pv
        ON  pv.id     = im.variant_id
        AND pv.org_id = ${orgId}
      LEFT JOIN sales s
        ON  s.id      = im.reference_id
        AND im.reference_type = 'SALE'
        AND s.org_id  = ${orgId}
      LEFT JOIN purchase_batches pb
        ON  pb.id     = im.reference_id
        AND im.reference_type = 'PURCHASE'
        AND pb.org_id = ${orgId}
      WHERE im.product_id = ${productId}
        AND im.org_id     = ${orgId}
      ORDER BY im.created_at DESC
      LIMIT 10
    `;

    // ── Compose response ─────────────────────────────────────────────
    const avgCostNum = Number(costRow?.avg_cost ?? 0);
    const calcMargin = (price: number, cost: number) =>
      price > 0 ? ((price - cost) / price) * 100 : 0;

    const data: any = {
      ...product,
      total_stock:      Number(stockRow.total_stock),
      avg_cost:         avgCostNum as number | null,
      last_cost:        Number(lastCostRow?.last_cost ?? 0) as number | null,
      margin_pct:       calcMargin(Number(product.price), avgCostNum) as number | null,
      variants:         variants.map((v) => {
        const avgCost = Number(v.avg_cost);
        return {
          ...v,
          stock:      Number(v.stock),
          avg_cost:   avgCost as number | null,
          margin_pct: calcMargin(Number(v.price_override ?? product.price), avgCost) as number | null,
        };
      }),
      batches:          batches.map((b) => ({ ...b })),
      sales_stats: {
        total_units_sold: Number(salesStats.total_units_sold),
        total_revenue:    Number(salesStats.total_revenue),
        total_profit:     Number(salesStats.total_profit) as number | null,
        avg_unit_price:   Number(salesStats.avg_unit_price),
        avg_unit_cost:    Number(salesStats.avg_unit_cost) as number | null,
        sales_count:      Number(salesStats.sales_count),
        last_sold_at:     salesStats.last_sold_at ?? null,
      },
      purchase_history: purchaseHistory.map((p) => ({
        ...p,
        unit_cost:     Number(p.unit_cost),
        unit_cost_usd: p.unit_cost_usd != null ? Number(p.unit_cost_usd) : null,
        quantity:      Number(p.quantity),
        variant_name:  p.variant_name ?? null,
      })),
      movements: movements.map((m) => ({ ...m })),
      cost_history: costHistory.map((b) => ({
        id:           Number(b.id),
        qty_in:       Number(b.qty_in),
        unit_cost:    Number(b.unit_cost),
        received_at:  b.received_at,
        variant_id:   b.variant_id ?? null,
        variant_name: b.variant_name ?? null,
      })),
    };

    // El costo (promedio, último, por lote, historial de compras) y el
    // margen/ganancia se filtran según show_costs / show_profit del rol.
    // Se usa el módulo INVENTORY (no PRODUCTS) porque esta es la vista de
    // detalle a la que se llega desde /inventory — el mismo criterio que ya
    // usa la lista de inventario para ocultar su columna de costo.
    const perms = await getModulePermissions(auth.data, 'INVENTORY');

    if (!perms.showCosts) {
      nullifyKeysDeep(data, new Set([
        "avg_cost", "last_cost", "unit_cost", "unit_cost_usd", "avg_unit_cost",
      ]));
      // El gráfico de evolución de precio de entrada se basa 100% en costo:
      // se vacía el arreglo en vez de anular cada campo, así el frontend
      // (que solo dibuja el gráfico si hay más de un punto) lo oculta solo.
      data.cost_history = [];
    }
    if (!perms.showProfit) {
      nullifyKeysDeep(data, new Set(["total_profit", "margin_pct"]));
    }

    return Response.json({ data });
  } catch (error) {
    console.error("GET /api/products/[id]/detail:", error);
    return createErrorResponse("Error al obtener detalle del producto", 500);
  }
}
