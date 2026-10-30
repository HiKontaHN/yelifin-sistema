import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";

async function authFor(request: NextRequest, permission: "canView" | "canEdit") {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return { response: createErrorResponse(auth.error, auth.status) } as const;
  const deny = await requireModule(auth.data, "FINANCES", permission, "ACCOUNTS");
  if (deny) return { response: deny } as const;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return { response: feature } as const;
  return { auth } as const;
}

export async function GET(request: NextRequest) {
  const checked = await authFor(request, "canView");
  if ("response" in checked) return checked.response;
  const search = request.nextUrl.searchParams.get("search")?.trim() || null;
  try {
    const data = await sql`
      SELECT ar.*, c.name AS customer_name,
        COALESCE(SUM(arp.amount), 0) AS paid_amount
      FROM accounts_receivable ar
      JOIN customers c ON c.id = ar.customer_id
      LEFT JOIN accounts_receivable_payments arp ON arp.receivable_id = ar.id
      WHERE ar.org_id = ${checked.auth.data.orgId}
        AND (${search}::text IS NULL OR c.name ILIKE ${"%" + (search ?? "") + "%"} OR ar.description ILIKE ${"%" + (search ?? "") + "%"})
      GROUP BY ar.id, c.name
      ORDER BY ar.status = 'PAID', ar.due_date NULLS LAST, ar.created_at DESC
    `;
    return Response.json({ data });
  } catch (error) {
    console.error("GET /api/accounts-receivable:", error);
    return createErrorResponse("Error al obtener cuentas por cobrar", 500);
  }
}

export async function POST(request: NextRequest) {
  const checked = await authFor(request, "canEdit");
  if ("response" in checked) return checked.response;
  try {
    const body = await request.json();
    const customerId = Number(body.customer_id);
    const amount = Number(body.original_amount);
    if (!Number.isSafeInteger(customerId) || customerId <= 0 || !Number.isFinite(amount) || amount <= 0) {
      return createErrorResponse("Cliente y monto son requeridos", 400);
    }
    const [customer] = await sql`SELECT id FROM customers WHERE id = ${customerId} AND org_id = ${checked.auth.data.orgId}`;
    if (!customer) return createErrorResponse("Cliente no encontrado", 404);
    const [row] = await sql`
      INSERT INTO accounts_receivable (
        org_id, customer_id, source_type, description, original_amount, outstanding_amount,
        currency, interest_rate, start_date, due_date, notes, created_by
      ) VALUES (
        ${checked.auth.data.orgId}, ${customerId}, ${body.source_type ?? "OTHER"},
        ${String(body.description ?? "Cuenta por cobrar").trim()}, ${amount}, ${amount},
        ${body.currency ?? "HNL"}, ${body.interest_rate ?? null}, ${body.start_date ?? new Date().toISOString().slice(0, 10)},
        ${body.due_date ?? null}, ${body.notes ?? null}, ${checked.auth.data.userId}
      ) RETURNING *
    `;
    return Response.json({ data: row }, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounts-receivable:", error);
    return createErrorResponse("Error al crear cuenta por cobrar", 500);
  }
}
