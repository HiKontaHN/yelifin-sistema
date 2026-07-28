// app/api/events/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

// ── GET /api/events ────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'EVENTS', 'canView');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;

    const rows = await sql`
      SELECT
        e.id,
        e.name,
        e.location,
        e.starts_at,
        e.ends_at,
        e.fixed_cost,
        e.notes,
        e.created_at,
        COALESCE(s_agg.total_sales,       0) AS total_sales,
        COALESCE(s_agg.total_tax,         0) AS total_tax,
        COALESCE(s_agg.total_profit,      0) AS total_profit,
        COALESCE(t_agg.total_tx_expenses, 0) AS total_tx_expenses
      FROM events e

      LEFT JOIN LATERAL (
        SELECT
          SUM(s.total)             AS total_sales,
          SUM(COALESCE(s.tax, 0)) AS total_tax,
          SUM(
            (SELECT COALESCE(SUM(si.line_total - si.unit_cost * si.quantity), 0)
             FROM sale_items si
             WHERE si.sale_id = s.id AND si.org_id = s.org_id)
            - COALESCE(s.tax, 0)
          ) AS total_profit
        FROM sales s
        WHERE s.event_id = e.id AND s.org_id = e.org_id
      ) s_agg ON true

      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(t.amount), 0) AS total_tx_expenses
        FROM transactions t
        WHERE t.reference_type = 'EVENT'
          AND t.reference_id   = e.id
          AND t.type           = 'EXPENSE'
          AND t.org_id         = e.org_id
      ) t_agg ON true

      WHERE e.org_id = ${orgId}
      ORDER BY e.starts_at DESC
    `;

    const now = new Date();

    const events = rows.map((e) => {
      const start         = new Date(e.starts_at);
      const end           = new Date(e.ends_at);
      const totalSales      = Number(e.total_sales);
      const totalTax        = Number(e.total_tax);
      const totalProfit     = Number(e.total_profit);
      const fixedCost       = Number(e.fixed_cost);
      const txExpenses      = Number(e.total_tx_expenses);
      const totalExpenses   = fixedCost + txExpenses;
      const netProfit       = totalProfit - totalExpenses;
      const totalCogs       = totalSales - totalTax - totalProfit;
      const totalInvestment = totalCogs + totalExpenses;

      const status =
        now < start  ? "PLANNED" :
        now <= end   ? "ACTIVE"  : "COMPLETED";

      return {
        id:             e.id,
        name:           e.name,
        location:       e.location,
        starts_at:      e.starts_at,
        ends_at:        e.ends_at,
        fixed_cost:     fixedCost,
        notes:          e.notes,
        created_at:     e.created_at,
        status,
        total_sales:    totalSales,
        total_expenses: totalExpenses,
        net_profit:     netProfit,
        roi:            totalInvestment > 0 ? (totalSales / totalInvestment) * 100 : 0,
      };
    });

    // Permisos atómicos del rol: anular ganancias/gastos si no puede verlos
    const perms = await getModulePermissions(auth.data, 'EVENTS');
    const payload = { data: events, total: events.length };
    if (!perms.showProfit) nullifyKeysDeep(payload, new Set(["total_expenses", "net_profit", "roi"]));

    return Response.json(payload);

  } catch (error) {
    console.error(" GET /api/events:", error);
    return createErrorResponse("Error al obtener eventos", 500);
  }
}

// ── POST /api/events ───────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'EVENTS', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { name, location, starts_at, ends_at, fixed_cost = 0, notes } = await request.json();

    if (!name?.trim())
      return createErrorResponse("El nombre es requerido", 400);
    if (!starts_at)
      return createErrorResponse("La fecha inicio es requerida", 400);
    if (!ends_at)
      return createErrorResponse("La fecha fin es requerida", 400);
    if (new Date(starts_at) > new Date(ends_at))
      return createErrorResponse("La fecha inicio debe ser antes que la fecha fin", 400);

    const [event] = await sql`
      INSERT INTO events (org_id, created_by, name, location, starts_at, ends_at, fixed_cost, notes)
      VALUES (
        ${orgId},
        ${userId},
        ${name.trim()},
        ${location?.trim() || null},
        ${starts_at},
        ${ends_at},
        ${fixed_cost},
        ${notes?.trim() || null}
      )
      RETURNING *
    `;

    return Response.json({ data: event }, { status: 201 });

  } catch (error) {
    console.error(" POST /api/events:", error);
    return createErrorResponse("Error al crear evento", 500);
  }
}