// app/api/credit-cards/[id]/payment/route.ts
import { NextRequest } from "next/server";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

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
    const cardId = Number(id);

    const {
      account_id,
      amount,
      currency,
      exchange_rate,
      occurred_at,
      description,
      category,
    } = await request.json();

    const accountId = Number(account_id);
    const amountNum = Number(amount);

    if (!Number.isSafeInteger(cardId) || cardId <= 0)
      return createErrorResponse("Tarjeta no encontrada", 404);
    if (!Number.isSafeInteger(accountId) || accountId <= 0)
      return createErrorResponse("La cuenta es requerida", 400);
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return createErrorResponse("El monto debe ser mayor a 0", 400);
    if (!currency) return createErrorResponse("La moneda es requerida", 400);

    const isUsd = currency === "USD";
    if (isUsd && (!exchange_rate || Number(exchange_rate) <= 0))
      return createErrorResponse("La tasa de cambio es requerida para pagos en USD", 400);

    const rateNum = Number(exchange_rate ?? 1);

    // El monto que se deduce de la cuenta siempre es en moneda local
    const localDeduction = isUsd ? amountNum * rateNum : amountNum;

    // Cálculo del amount_local (referencial en moneda nativa)
    const amountLocal = isUsd ? amountNum * rateNum : amountNum;

    const occurredAtVal = occurred_at ?? new Date().toISOString();
    const desc = description?.trim() || "Pago de tarjeta de crédito";

    const result = await withTransaction(async (tx) => {
      const [account] = await tx`
        SELECT id FROM accounts
        WHERE id = ${accountId} AND org_id = ${orgId} AND is_active = TRUE
        FOR UPDATE
      `;
      if (!account) return { ok: false as const, error: "Cuenta no encontrada", status: 404 as const };

      const [card] = await tx`
        SELECT id, balance, balance_usd
        FROM credit_cards
        WHERE id = ${cardId} AND org_id = ${orgId} AND is_active = TRUE
        FOR UPDATE
      `;
      if (!card) return { ok: false as const, error: "Tarjeta no encontrada", status: 404 as const };

      const outstanding = Number(isUsd ? card.balance_usd : card.balance);
      if (amountNum > outstanding) {
        return {
          ok: false as const,
          error: "El monto del pago no puede superar el saldo pendiente de la tarjeta",
          status: 400 as const,
        };
      }

      const [txn] = await tx`
        INSERT INTO transactions (
          org_id, created_by, type, account_id, amount,
          category, description, reference_type, credit_card_id, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, 'EXPENSE', ${accountId}, ${localDeduction},
          ${category?.trim() || null}, ${desc}, 'CREDIT_CARD_PAYMENT', ${cardId}, ${occurredAtVal}
        )
        RETURNING id
      `;

      await tx`
        UPDATE accounts
        SET balance = balance - ${localDeduction}, updated_by = ${userId}
        WHERE id = ${accountId} AND org_id = ${orgId}
      `;

      const [ccTxn] = await tx`
        INSERT INTO credit_card_transactions (
          org_id, created_by, credit_card_id, type, description,
          amount, currency, exchange_rate, amount_local,
          account_transaction_id, category, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, ${cardId}, 'PAYMENT', ${desc},
          ${amountNum}, ${currency}, ${isUsd ? rateNum : null},
          ${amountLocal}, ${txn.id}, ${category?.trim() || null}, ${occurredAtVal}
        )
        RETURNING id
      `;

      if (isUsd) {
        await tx`
          UPDATE credit_cards
          SET balance_usd = balance_usd - ${amountNum},
              updated_at  = NOW(),
              updated_by  = ${userId}
          WHERE id = ${cardId} AND org_id = ${orgId}
        `;
      } else {
        await tx`
          UPDATE credit_cards
          SET balance    = balance - ${amountNum},
              updated_at = NOW(),
              updated_by = ${userId}
          WHERE id = ${cardId} AND org_id = ${orgId}
        `;
      }

      return {
        ok: true as const,
        creditCardTransactionId: Number(ccTxn.id),
        accountTransactionId: Number(txn.id),
      };
    });

    if (!result.ok) return createErrorResponse(result.error, result.status);

    return Response.json(
      {
        message: "Pago registrado",
        data: {
          credit_card_transaction_id: result.creditCardTransactionId,
          account_transaction_id: result.accountTransactionId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/credit-cards/[id]/payment:", error);
    return createErrorResponse("Error al registrar pago", 500);
  }
}
