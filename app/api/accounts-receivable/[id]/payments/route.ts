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

  const receivableId = Number((await params).id);
  const body = await request.json();
  const amount = Number(body.amount);
  const accountId = Number(body.account_id);
  if (!Number.isSafeInteger(receivableId) || receivableId <= 0 || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(accountId)) {
    return createErrorResponse("Cuenta, monto y cuenta financiera son requeridos", 400);
  }

  try {
    const result = await withTransaction(async (tx) => {
      const [receivable] = await tx`
        SELECT id, source_type, source_id, outstanding_amount, status FROM accounts_receivable
        WHERE id = ${receivableId} AND org_id = ${auth.data.orgId} FOR UPDATE
      `;
      const [account] = await tx`
        SELECT id, is_active FROM accounts WHERE id = ${accountId} AND org_id = ${auth.data.orgId} FOR UPDATE
      `;
      if (!receivable) return { error: "Cuenta por cobrar no encontrada", status: 404 } as const;
      if (!account?.is_active) return { error: "Cuenta financiera no encontrada", status: 404 } as const;
      if (amount > Number(receivable.outstanding_amount)) return { error: "El pago supera el saldo pendiente", status: 400 } as const;

      const [transaction] = await tx`
        INSERT INTO transactions (org_id, created_by, type, account_id, amount, category, description, reference_type, reference_id, occurred_at)
        VALUES (${auth.data.orgId}, ${auth.data.userId}, 'INCOME', ${accountId}, ${amount}, 'Cobros',
          ${body.notes ?? "Abono de cuenta por cobrar"}, 'RECEIVABLE_PAYMENT', ${receivableId}, ${body.paid_at ?? new Date().toISOString()})
        RETURNING id
      `;
      await tx`UPDATE accounts SET balance = balance + ${amount}, updated_by = ${auth.data.userId} WHERE id = ${accountId} AND org_id = ${auth.data.orgId}`;
      await tx`
        INSERT INTO accounts_receivable_payments (receivable_id, installment_id, account_id, transaction_id, amount, paid_at, payment_method, notes, created_by)
        VALUES (${receivableId}, ${body.installment_id ?? null}, ${accountId}, ${transaction.id}, ${amount}, ${body.paid_at ?? new Date().toISOString()}, ${body.payment_method ?? null}, ${body.notes ?? null}, ${auth.data.userId})
      `;
      const remaining = Number(receivable.outstanding_amount) - amount;
      await tx`
        UPDATE accounts_receivable
        SET outstanding_amount = ${remaining}, status = ${remaining === 0 ? "PAID" : "PARTIAL"}, updated_by = ${auth.data.userId}, updated_at = NOW()
        WHERE id = ${receivableId} AND org_id = ${auth.data.orgId}
      `;
      if (receivable.source_type === "CREDIT_SALE" && receivable.source_id) {
        await tx`
          UPDATE sales
          SET payment_status = ${remaining === 0 ? "PAID" : "PARTIAL"}, updated_at = NOW(), updated_by = ${auth.data.userId}
          WHERE id = ${receivable.source_id} AND org_id = ${auth.data.orgId}
        `;
      }
      return { transactionId: Number(transaction.id), remaining } as const;
    });
    if ("error" in result && result.error) return createErrorResponse(result.error, result.status);
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounts-receivable/[id]/payments:", error);
    return createErrorResponse("Error al registrar el cobro", 500);
  }
}
