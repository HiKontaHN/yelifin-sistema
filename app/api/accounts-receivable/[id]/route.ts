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
      SELECT ar.*, c.name AS customer_name,
        COALESCE((SELECT SUM(amount) FROM accounts_receivable_payments WHERE receivable_id = ar.id), 0) AS paid_amount
      FROM accounts_receivable ar
      JOIN customers c ON c.id = ar.customer_id
      WHERE ar.id = ${id} AND ar.org_id = ${auth.data.orgId}
    `;
    if (!account) return createErrorResponse("Cuenta por cobrar no encontrada", 404);
    const [installments, payments] = await Promise.all([
      sql`SELECT * FROM accounts_receivable_installments WHERE receivable_id = ${id} ORDER BY installment_number`,
      sql`SELECT arp.*, a.name AS account_name FROM accounts_receivable_payments arp JOIN accounts a ON a.id = arp.account_id WHERE arp.receivable_id = ${id} ORDER BY arp.paid_at DESC`,
    ]);
    return Response.json({ data: { account, installments, payments } });
  } catch (error) {
    console.error("GET /api/accounts-receivable/[id]:", error);
    return createErrorResponse("Error al obtener el detalle", 500);
  }
}
