// app/api/events/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import { computeEventStatus } from "@/lib/date-utils";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'EVENTS', 'canView');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const eventId    = Number(id);

    // ── Evento base ────────────────────────────────────────────────────
    const [event] = await sql`
      SELECT id, name, location, starts_at, ends_at, fixed_cost, notes, created_at
      FROM events
      WHERE id = ${eventId} AND org_id = ${orgId}
    `;
    if (!event) return createErrorResponse("Evento no encontrado", 404);

    // ── Ventas del evento ──────────────────────────────────────────────
    // Profit TAX-INCLUSIVE: restamos el ISV de cada venta
    const sales = await sql`
      SELECT
        s.id,
        s.sale_number,
        s.subtotal,
        s.discount,
        s.tax_rate,
        s.tax,
        s.shipping_cost,
        s.total,
        s.payment_method,
        s.sold_at,
        c.name AS customer_name,
        a.name AS account_name,
        COUNT(si.id)::int AS items_count,
        COALESCE(SUM(si.line_total - (si.unit_cost * si.quantity)), 0)
          - COALESCE(s.tax, 0) AS profit
      FROM sales s
      LEFT JOIN customers c   ON c.id = s.customer_id
      LEFT JOIN accounts  a   ON a.id = s.account_id
      LEFT JOIN sale_items si ON si.sale_id = s.id AND si.org_id = s.org_id
      WHERE s.event_id = ${eventId} AND s.org_id = ${orgId}
      GROUP BY s.id, c.name, a.name
      ORDER BY s.sold_at ASC
    `;

    // ── Gastos del evento (transacciones EXPENSE) ──────────────────────
    const expenses = await sql`
      SELECT id, description, amount, occurred_at
      FROM transactions
      WHERE reference_type = 'EVENT'
        AND reference_id   = ${eventId}
        AND type           = 'EXPENSE'
        AND org_id         = ${orgId}
      ORDER BY occurred_at ASC
    `;

    // ── Totales ────────────────────────────────────────────────────────
    const totalSales      = sales.reduce((acc: number, s: any) => acc + Number(s.total), 0);
    const totalTax        = sales.reduce((acc: number, s: any) => acc + Number(s.tax ?? 0), 0);
    const totalProfit     = sales.reduce((acc: number, s: any) => acc + Number(s.profit), 0);
    const fixedCost       = Number(event.fixed_cost ?? 0);
    const txExpenses      = expenses.reduce((acc: number, e: any) => acc + Number(e.amount), 0);
    const totalExpenses   = fixedCost + txExpenses;
    const netProfit       = totalProfit - totalExpenses;
    const totalCogs       = totalSales - totalTax - totalProfit;
    const totalInvestment = totalCogs + totalExpenses;

    const byAccount: Record<string, number> = {};
    for (const s of sales) {
      const name = (s.account_name as string) ?? "Sin cuenta";
      byAccount[name] = (byAccount[name] ?? 0) + Number(s.total);
    }

    const now    = new Date();
    const start  = new Date(event.starts_at);
    const end    = new Date(event.ends_at);
    const status = computeEventStatus(start, end, now);

    const payload = {
      data: {
        id:          event.id,
        name:        event.name,
        location:    event.location,
        starts_at:   event.starts_at,
        ends_at:     event.ends_at,
        fixed_cost:  fixedCost,
        notes:       event.notes,
        created_at:  event.created_at,
        status,
        summary: {
          total_sales:    totalSales,     // lo que cobró el cliente (con ISV y envío)
          total_tax:      totalTax,       // ISV extraído de las ventas
          total_profit:   totalProfit,    // ganancia bruta de ventas (sin ISV, sin costos evento)
          total_expenses: totalExpenses,  // costos fijos + gastos extra
          net_profit:     netProfit,      // ganancia final
          roi:            totalInvestment > 0 ? (totalSales / totalInvestment) * 100 : 0,
          sales_count:    sales.length,
          by_account:     byAccount,
        },
        sales:    sales.map((s: any) => ({
          id:             Number(s.id),
          sale_number:    String(s.sale_number),
          subtotal:       Number(s.subtotal),
          discount:       Number(s.discount ?? 0),
          tax_rate:       Number(s.tax_rate ?? 0),
          tax:            Number(s.tax ?? 0),
          shipping_cost:  Number(s.shipping_cost ?? 0),
          total:          Number(s.total),
          payment_method: s.payment_method ?? "OTHER",
          sold_at:        String(s.sold_at),
          customer_name:  s.customer_name ?? null,
          account_name:   s.account_name ?? null,
          items_count:    Number(s.items_count),
          profit:         Number(s.profit),
        })),
        expenses: expenses.map((e: any) => ({
          id:          Number(e.id),
          description: String(e.description),
          amount:      Number(e.amount),
          occurred_at: String(e.occurred_at),
        })),
      },
    };

    // Permisos atómicos del rol: anular ganancias/gastos si no puede verlos
    const perms = await getModulePermissions(auth.data, 'EVENTS');
    if (!perms.showProfit) {
      nullifyKeysDeep(payload, new Set(["total_profit", "total_expenses", "net_profit", "roi", "profit", "amount"]));
    }

    return Response.json(payload);

  } catch (error) {
    console.error(" GET /api/events/[id]:", error);
    return createErrorResponse("Error al obtener evento", 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'EVENTS', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const eventId    = Number(id);

    const body = await request.json();
    const { name, location, starts_at, ends_at, fixed_cost, notes } = body;

    // Validaciones
    if (name !== undefined && !String(name).trim())
      return createErrorResponse("El nombre no puede estar vacío", 400);
    if (starts_at && ends_at && new Date(starts_at) > new Date(ends_at))
      return createErrorResponse("La fecha inicio debe ser antes o igual que la fecha fin", 400);

    // Verificar que el evento pertenece a la organización
    const [existing] = await sql`
      SELECT id FROM events WHERE id = ${eventId} AND org_id = ${orgId}
    `;
    if (!existing) return createErrorResponse("Evento no encontrado", 404);

    // Normalizar: string vacío → null para campos opcionales
    const locationVal  = location  !== undefined ? (location?.trim()  || null) : undefined;
    const notesVal     = notes     !== undefined ? (notes?.trim()     || null) : undefined;

    const [updated] = await sql`
      UPDATE events SET
        name       = COALESCE(${name?.trim() ?? null},  name),
        location   = COALESCE(${locationVal  ?? null},  location),
        starts_at  = COALESCE(${starts_at    ?? null},  starts_at),
        ends_at    = COALESCE(${ends_at      ?? null},  ends_at),
        fixed_cost = COALESCE(${fixed_cost   ?? null},  fixed_cost),
        notes      = COALESCE(${notesVal     ?? null},  notes),
        updated_by = ${userId}
      WHERE id = ${eventId} AND org_id = ${orgId}
      RETURNING *
    `;

    return Response.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/events/[id]:", error);
    return createErrorResponse("Error al actualizar evento", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'EVENTS', 'canDelete');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const eventId    = Number(id);

    const [existing] = await sql`
      SELECT id FROM events WHERE id = ${eventId} AND org_id = ${orgId}
    `;
    if (!existing) return createErrorResponse("Evento no encontrado", 404);

    await sql`DELETE FROM events WHERE id = ${eventId} AND org_id = ${orgId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/events/[id]:", error);
    return createErrorResponse("Error al eliminar evento", 500);
  }
}