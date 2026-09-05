// app/api/credit-cards/[id]/payment/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit', 'CREDIT_CARDS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;

    const {
      account_id,
      amount,
      currency,
      exchange_rate,
      occurred_at,
      description,
      category,
    } = await request.json();

    if (!account_id) return createErrorResponse("La cuenta es requerida", 400);
    if (!amount || Number(amount) <= 0) return createErrorResponse("El monto debe ser mayor a 0", 400);
    if (!currency) return createErrorResponse("La moneda es requerida", 400);

    const isUsd = currency === "USD";
    if (isUsd && (!exchange_rate || Number(exchange_rate) <= 0))
      return createErrorResponse("La tasa de cambio es requerida para pagos en USD", 400);

    const [card] = await sql`
      SELECT id, balance, balance_usd
      FROM credit_cards
      WHERE id = ${Number(id)} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!card) return createErrorResponse("Tarjeta no encontrada", 404);

    const [account] = await sql`
      SELECT id, balance FROM accounts
      WHERE id = ${Number(account_id)} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!account) return createErrorResponse("Cuenta no encontrada", 404);

    const amountNum = Number(amount);
    const rateNum = Number(exchange_rate ?? 1);

    // El monto que se deduce de la cuenta siempre es en moneda local
    const localDeduction = isUsd ? amountNum * rateNum : amountNum;

    // Cálculo del amount_local (referencial en moneda nativa)
    const amountLocal = isUsd ? amountNum * rateNum : amountNum;

    const occurredAtVal = occurred_at ?? new Date().toISOString();
    const desc = description?.trim() || "Pago de tarjeta de crédito";

    // Transacción atómica
    await sql`BEGIN`;
    try {
      // 1. Crear la transacción de egreso en la cuenta
      const [txn] = await sql`
        INSERT INTO transactions (
          org_id, created_by, type, account_id, amount,
          category, description, reference_type, credit_card_id, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, 'EXPENSE', ${Number(account_id)}, ${localDeduction},
          ${category?.trim() || null}, ${desc}, 'CREDIT_CARD_PAYMENT', ${Number(id)}, ${occurredAtVal}
        )
        RETURNING id
      `;

      // 2. Descontar de la cuenta
      await sql`
        UPDATE accounts
        SET balance = balance - ${localDeduction}
        WHERE id = ${Number(account_id)} AND org_id = ${orgId}
      `;

      // 3. Registrar en credit_card_transactions
      const [ccTxn] = await sql`
        INSERT INTO credit_card_transactions (
          org_id, created_by, credit_card_id, type, description,
          amount, currency, exchange_rate, amount_local,
          account_transaction_id, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, ${Number(id)}, 'PAYMENT', ${desc},
          ${amountNum}, ${currency}, ${isUsd ? rateNum : null},
          ${amountLocal}, ${txn.id}, ${occurredAtVal}
        )
        RETURNING id
      `;

      // 4. Reducir el saldo de la tarjeta
      if (isUsd) {
        await sql`
          UPDATE credit_cards
          SET balance_usd = GREATEST(0, balance_usd - ${amountNum}),
              updated_at  = NOW()
          WHERE id = ${Number(id)} AND org_id = ${orgId}
        `;
      } else {
        await sql`
          UPDATE credit_cards
          SET balance    = GREATEST(0, balance - ${amountNum}),
              updated_at = NOW()
          WHERE id = ${Number(id)} AND org_id = ${orgId}
        `;
      }

      await sql`COMMIT`;

      return Response.json(
        { message: "Pago registrado", data: { credit_card_transaction_id: ccTxn.id, account_transaction_id: txn.id } },
        { status: 201 }
      );
    } catch (inner) {
      await sql`ROLLBACK`;
      throw inner;
    }
  } catch (error) {
    console.error("POST /api/credit-cards/[id]/payment:", error);
    return createErrorResponse("Error al registrar pago", 500);
  }
}
