import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";
import { todayInTimeZone, type CalendarDate } from "@/lib/date-utils";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstAutoPaymentDate(day: number, timezone: string): CalendarDate {
  const today = todayInTimeZone(timezone);
  let [year, month] = today.split("-").map(Number);
  const build = () => `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, daysInMonth(year, month))).padStart(2, "0")}` as CalendarDate;
  let candidate = build();
  if (candidate < today) {
    if (month === 12) { year += 1; month = 1; } else { month += 1; }
    candidate = build();
  }
  return candidate;
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
      SELECT ap.*,
        ap.start_date::text AS start_date,
        ap.due_date::text AS due_date,
        ap.auto_payment_next_date::text AS auto_payment_next_date,
        e.name AS entity_name, e.entity_type, aa.name AS auto_payment_account_name,
        COALESCE((SELECT SUM(amount) FROM accounts_payable_payments WHERE payable_id = ap.id), 0) AS paid_amount
      FROM accounts_payable ap
      JOIN financial_entities e ON e.id = ap.entity_id
      LEFT JOIN accounts aa ON aa.id = ap.auto_payment_account_id
      WHERE ap.id = ${id} AND ap.org_id = ${auth.data.orgId}
    `;
    if (!account) return createErrorResponse("Cuenta por pagar no encontrada", 404);
    const [installments, payments] = await Promise.all([
      sql`SELECT *, due_date::text AS due_date FROM accounts_payable_installments WHERE payable_id = ${id} ORDER BY installment_number`,
      sql`
        SELECT app.*, a.name AS account_name,
          COALESCE(t.effective_date, app.paid_at::date)::text AS payment_date
        FROM accounts_payable_payments app
        JOIN accounts a ON a.id = app.account_id
        LEFT JOIN transactions t ON t.id = app.transaction_id AND t.org_id = ${auth.data.orgId}
        WHERE app.payable_id = ${id}
        ORDER BY COALESCE(t.effective_date, app.paid_at::date) DESC, app.id DESC
      `,
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
    const nextDate = enabled && paymentDay ? firstAutoPaymentDate(Number(paymentDay), auth.data.timezone) : null;
    const [updated] = await sql`
      UPDATE accounts_payable
      SET auto_payment_enabled = ${enabled},
          auto_payment_account_id = ${accountId},
          auto_payment_day = ${paymentDay},
          auto_payment_next_date = ${nextDate},
          updated_by = ${auth.data.userId},
          updated_at = NOW()
      WHERE id = ${id} AND org_id = ${auth.data.orgId} AND status <> 'CANCELLED'
      RETURNING *, start_date::text AS start_date, due_date::text AS due_date, auto_payment_next_date::text AS auto_payment_next_date
    `;
    if (!updated) return createErrorResponse("Cuenta por pagar no encontrada", 404);
    return Response.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/accounts-payable/[id]:", error);
    return createErrorResponse("Error al actualizar el abono automático", 500);
  }
}
