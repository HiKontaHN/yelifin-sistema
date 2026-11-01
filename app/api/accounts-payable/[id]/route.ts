import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";

function firstAutoPaymentDate(day: number) {
  const today = new Date();
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12));
  const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), Math.min(day, 28), 12));
  if (candidate < current) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate();
  candidate.setUTCDate(Math.min(day, lastDay));
  return candidate.toISOString().slice(0, 10);
}

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
      SELECT ap.*, e.name AS entity_name, e.entity_type, aa.name AS auto_payment_account_name,
        COALESCE((SELECT SUM(amount) FROM accounts_payable_payments WHERE payable_id = ap.id), 0) AS paid_amount
      FROM accounts_payable ap
      JOIN financial_entities e ON e.id = ap.entity_id
      LEFT JOIN accounts aa ON aa.id = ap.auto_payment_account_id
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

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "FINANCES", "canDelete", "ACCOUNTS");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return createErrorResponse("Cuenta inválida", 400);
  try {
    const [account] = await sql`
      UPDATE accounts_payable
      SET status = 'CANCELLED', updated_by = ${auth.data.userId}, updated_at = NOW()
      WHERE id = ${id} AND org_id = ${auth.data.orgId} AND status <> 'CANCELLED'
      RETURNING id
    `;
    if (!account) return createErrorResponse("Cuenta por pagar no encontrada", 404);
    return Response.json({ message: "Cuenta por pagar cancelada" });
  } catch (error) {
    console.error("DELETE /api/accounts-payable/[id]:", error);
    return createErrorResponse("Error al eliminar la cuenta por pagar", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "FINANCES", "canEdit", "ACCOUNTS");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return createErrorResponse("Cuenta inválida", 400);
  try {
    const body = await request.json();
    const enabled = body.auto_payment_enabled === true;
    const accountId = enabled ? Number(body.auto_payment_account_id) : null;
    const paymentDay = enabled ? Number(body.auto_payment_day) : null;
    if (enabled && (!Number.isSafeInteger(accountId) || !Number.isInteger(paymentDay) || Number(paymentDay) < 1 || Number(paymentDay) > 31)) {
      return createErrorResponse("Selecciona la cuenta y un día del mes válido", 400);
    }
    if (enabled) {
      const [account] = await sql`SELECT id FROM accounts WHERE id = ${accountId} AND org_id = ${auth.data.orgId} AND is_active = TRUE`;
      if (!account) return createErrorResponse("Cuenta financiera no encontrada", 404);
    }
    const nextDate = enabled && paymentDay ? firstAutoPaymentDate(Number(paymentDay)) : null;
    const [updated] = await sql`
      UPDATE accounts_payable
      SET auto_payment_enabled = ${enabled},
          auto_payment_account_id = ${accountId},
          auto_payment_day = ${paymentDay},
          auto_payment_next_date = ${nextDate},
          updated_by = ${auth.data.userId},
          updated_at = NOW()
      WHERE id = ${id} AND org_id = ${auth.data.orgId} AND status <> 'CANCELLED'
      RETURNING *
    `;
    if (!updated) return createErrorResponse("Cuenta por pagar no encontrada", 404);
    return Response.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/accounts-payable/[id]:", error);
    return createErrorResponse("Error al actualizar el abono automático", 500);
  }
}
