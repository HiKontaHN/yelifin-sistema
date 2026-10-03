// app/api/organization/warehouses/[id]/stock/route.ts
// Stock disponible por producto/variante en una bodega (para transferencias).
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canView', 'STOCK');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const { id } = await params;
    const warehouseId = Number(id);
    if (!warehouseId) return createErrorResponse("Bodega inválida", 400);

    const rows = await sql`
      SELECT
        p.id            AS product_id,
        pv.id           AS variant_id,
        p.name          AS product_name,
        pv.variant_name,
        SUM(ib.qty_available)::float AS stock
      FROM inventory_batches ib
      JOIN products p              ON p.id = ib.product_id AND p.org_id = ib.org_id
      LEFT JOIN product_variants pv ON pv.id = ib.variant_id
      WHERE ib.org_id       = ${orgId}
        AND ib.warehouse_id = ${warehouseId}
        AND ib.qty_available > 0
        AND p.is_active  = TRUE
        AND p.is_service = FALSE
        AND (pv.id IS NULL OR pv.is_active = TRUE)
      GROUP BY p.id, pv.id, p.name, pv.variant_name
      ORDER BY p.name, pv.variant_name
    `;

    return Response.json({ data: rows });
  } catch (error) {
    console.error("Error fetching warehouse stock:", error);
    return createErrorResponse("Error al obtener el stock de la bodega", 500);
  }
}
