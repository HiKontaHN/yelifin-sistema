import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "FINANCES", "canEdit", "ACCOUNTS");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;

  const payableId = Number((await params).id);
  const body = await request.json();
  const amount = Number(body.amount);
  const accountId = Number(body.account_id);
  if (!Number.isSafeInteger(payableId) || payableId <= 0 || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(accountId)) {
    return createErrorResponse("Cuenta, monto y cuenta financiera son requeridos", 400);
  }

  try {
    const result = await withTransaction(async (tx) => {
      const [payable] = await tx`
        SELECT id, outstanding_amount FROM accounts_payable
        WHERE id = ${payableId} AND org_id = ${auth.data.orgId} FOR UPDATE
      `;
      const [account] = await tx`
        SELECT id, is_active FROM accounts WHERE id = ${accountId} AND org_id = ${auth.data.orgId} FOR UPDATE
      `;
      if (!payable) return { error: "Cuenta por pagar no encontrada", status: 404 } as const;
      if (!account?.is_active) return { error: "Cuenta financiera no encontrada", status: 404 } as const;
      if (amount > Number(payable.outstanding_amount)) return { error: "El pago supera el saldo pendiente", status: 400 } as const;

      const [transaction] = await tx`
        INSERT INTO transactions (org_id, created_by, type, account_id, amount, category, description, reference_type, reference_id, occurred_at)
        VALUES (${auth.data.orgId}, ${auth.data.userId}, 'EXPENSE', ${accountId}, ${amount}, 'Pagos de deudas',
          ${body.notes ?? "Abono de cuenta por pagar"}, 'PAYABLE_PAYMENT', ${payableId}, ${body.paid_at ?? new Date().toISOString()})
        RETURNING id
      `;
      await tx`UPDATE accounts SET balance = balance - ${amount}, updated_by = ${auth.data.userId} WHERE id = ${accountId} AND org_id = ${auth.data.orgId}`;
      await tx`
        INSERT INTO accounts_payable_payments (payable_id, installment_id, account_id, transaction_id, amount, paid_at, payment_method, notes, created_by)
        VALUES (${payableId}, ${body.installment_id ?? null}, ${accountId}, ${transaction.id}, ${amount}, ${body.paid_at ?? new Date().toISOString()}, ${body.payment_method ?? null}, ${body.notes ?? null}, ${auth.data.userId})
      `;
      const remaining = Number(payable.outstanding_amount) - amount;
      await tx`
        UPDATE accounts_payable
        SET outstanding_amount = ${remaining}, status = ${remaining === 0 ? "PAID" : "PARTIAL"}, updated_by = ${auth.data.userId}, updated_at = NOW()
        WHERE id = ${payableId} AND org_id = ${auth.data.orgId}
      `;
      return { transactionId: Number(transaction.id), remaining } as const;
    });
    if ("error" in result && result.error) return createErrorResponse(result.error, result.status);
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounts-payable/[id]/payments:", error);
    return createErrorResponse("Error al registrar el pago", 500);
  }
}
