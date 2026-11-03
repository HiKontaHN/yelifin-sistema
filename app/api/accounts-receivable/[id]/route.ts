import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "FINANCES", "canView", "ACCOUNTS");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return createErrorResponse("Cuenta inválida", 400);
  try {
    const [account] = await sql`
      SELECT ar.*,
        ar.start_date::text AS start_date,
        ar.due_date::text AS due_date,
        COALESCE(p.name, c.name) AS customer_name,
        COALESCE((SELECT SUM(amount) FROM accounts_receivable_payments WHERE receivable_id = ar.id), 0) AS paid_amount
      FROM accounts_receivable ar
      LEFT JOIN customers c ON c.id = ar.customer_id
      LEFT JOIN people p ON p.id = ar.person_id
      WHERE ar.id = ${id} AND ar.org_id = ${auth.data.orgId}
    `;
    if (!account) return createErrorResponse("Cuenta por cobrar no encontrada", 404);
    const [installments, payments] = await Promise.all([
      sql`SELECT *, due_date::text AS due_date FROM accounts_receivable_installments WHERE receivable_id = ${id} ORDER BY installment_number`,
      sql`
        SELECT arp.*, a.name AS account_name,
          COALESCE(t.effective_date, arp.paid_at::date)::text AS payment_date
        FROM accounts_receivable_payments arp
        JOIN accounts a ON a.id = arp.account_id
        LEFT JOIN transactions t ON t.id = arp.transaction_id AND t.org_id = ${auth.data.orgId}
        WHERE arp.receivable_id = ${id}
        ORDER BY COALESCE(t.effective_date, arp.paid_at::date) DESC, arp.id DESC
      `,
    ]);
    return Response.json({ data: { account, installments, payments } });
  } catch (error) {
    console.error("GET /api/accounts-receivable/[id]:", error);
    return createErrorResponse("Error al obtener el detalle", 500);
  }
}
