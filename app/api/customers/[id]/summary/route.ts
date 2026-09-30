// app/api/customers/[id]/summary/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);
type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'CUSTOMERS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'customers.manage');
  if (denyFeature) return denyFeature;

  const { userId, orgId } = auth.data;
  const { id } = await params;
  const customerId = Number(id);
  if (isNaN(customerId)) return createErrorResponse("ID inválido", 400);

  try {
    const [customer] = await sql`
      SELECT
        c.id, c.name, c.phone, c.email, c.notes,
        c.total_orders, c.total_spent, c.created_at,
        MAX(s.sold_at) AS last_purchase_at,
        CASE WHEN COUNT(s.id) > 0
          THEN ROUND((SUM(s.total) / COUNT(s.id))::numeric, 2)
          ELSE 0
        END AS avg_order_value
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id
        AND s.org_id = c.org_id
        AND s.status != 'CANCELLED'
      WHERE c.id = ${customerId} AND c.org_id = ${orgId}
      GROUP BY c.id
    `;

    if (!customer) return createErrorResponse("Cliente no encontrado", 404);

    // Detalle de líneas por venta (para el tooltip de la card: cantidad de
    // productos y el desglose) — solo 6 ventas, así que el N+1 es barato.
    const recentSales = await sql`
      SELECT
        s.id, s.sale_number, s.total, s.sold_at, s.status, s.discount, s.shipping_cost,
        COALESCE(items.items_count, 0)::int    AS items_count,
        COALESCE(items.total_quantity, 0)::int AS total_quantity,
        COALESCE(items.items, '[]'::jsonb)     AS items
      FROM sales s
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int      AS items_count,
          SUM(si.quantity)   AS total_quantity,
          jsonb_agg(
            jsonb_build_object(
              'product_name', COALESCE(p.name, 'Producto eliminado'),
              'quantity',     si.quantity
            ) ORDER BY si.id
          ) AS items
        FROM sale_items si
        LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = s.id AND si.org_id = s.org_id
      ) items ON TRUE
      WHERE s.customer_id = ${customerId} AND s.org_id = ${orgId}
      ORDER BY s.sold_at DESC
      LIMIT 6
    `;

    return Response.json({ customer, recentSales });
  } catch (error) {
    console.error("GET /api/customers/[id]/summary:", error);
    return createErrorResponse("Error al obtener resumen del cliente", 500);
  }
}
