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
      SELECT ap.*, e.name AS entity_name, e.entity_type,
        COALESCE((SELECT SUM(amount) FROM accounts_payable_payments WHERE payable_id = ap.id), 0) AS paid_amount
      FROM accounts_payable ap
      JOIN financial_entities e ON e.id = ap.entity_id
      WHERE ap.id = ${id} AND ap.org_id = ${auth.data.orgId}
    `;
    if (!account) return createErrorResponse("Cuenta por pagar no encontrada", 404);
    const [installments, payments] = await Promise.all([
      sql`SELECT * FROM accounts_payable_installments WHERE payable_id = ${id} ORDER BY installment_number`,
      sql`SELECT app.*, a.name AS account_name FROM accounts_payable_payments app JOIN accounts a ON a.id = app.account_id WHERE app.payable_id = ${id} ORDER BY app.paid_at DESC`,
    ]);
    return Response.json({ data: { account, installments, payments } });
  } catch (error) {
    console.error("GET /api/accounts-payable/[id]:", error);
    return createErrorResponse("Error al obtener el detalle", 500);
  }
}
