import { NextRequest } from "next/server";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

export async function PATCH(
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
    const txId = Number(id);
    const body = await request.json();
    const { description, category, occurred_at, amount, currency, exchange_rate } = body;

    if (!Number.isSafeInteger(txId) || txId <= 0)
      return createErrorResponse("Transacción no encontrada", 404);
    if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0))
      return createErrorResponse("El monto debe ser mayor a 0", 400);
    if (exchange_rate !== undefined && (!Number.isFinite(Number(exchange_rate)) || Number(exchange_rate) <= 0))
      return createErrorResponse("La tasa de cambio debe ser mayor a 0", 400);

    const result = await withTransaction(async (tx) => {
      const [existing] = await tx`
        SELECT
          id, type, amount, currency, exchange_rate, amount_local,
          sale_id, purchase_batch_id, credit_card_id,
          description, category, occurred_at
        FROM credit_card_transactions
        WHERE id = ${txId} AND org_id = ${orgId}
        FOR UPDATE
      `;
      if (!existing)
        return { ok: false as const, error: "Transacción no encontrada", status: 404 as const };
      if (
        existing.type !== "CHARGE" ||
        existing.sale_id !== null ||
        existing.purchase_batch_id !== null
      ) {
        return { ok: false as const, error: "Esta transacción está vinculada y debe editarse desde su origen", status: 422 as const };
      }

      const [card] = await tx`
        SELECT id, balance, balance_usd
        FROM credit_cards
        WHERE id = ${existing.credit_card_id} AND org_id = ${orgId}
        FOR UPDATE
      `;
      if (!card) return { ok: false as const, error: "Tarjeta no encontrada", status: 404 as const };

      const newAmount = amount !== undefined ? Number(amount) : Number(existing.amount);
      const newCurrency = currency ?? existing.currency;
      const oldAmount = Number(existing.amount);
      const oldCurrency = String(existing.currency);
      const newExchangeRate = newCurrency === "USD"
        ? (exchange_rate !== undefined ? Number(exchange_rate) : Number(existing.exchange_rate))
        : null;
      if (newCurrency === "USD" && (!Number.isFinite(newExchangeRate) || Number(newExchangeRate) <= 0)) {
        return { ok: false as const, error: "La tasa de cambio es requerida para cargos en USD", status: 400 as const };
      }
      const newAmountLocal = newCurrency === "USD"
        ? newAmount * Number(newExchangeRate)
        : newAmount;

      let nextLocalBalance = Number(card.balance);
      let nextUsdBalance = Number(card.balance_usd);
      if (oldCurrency === "USD") nextUsdBalance -= oldAmount;
      else nextLocalBalance -= oldAmount;
      if (newCurrency === "USD") nextUsdBalance += newAmount;
      else nextLocalBalance += newAmount;

      if (nextLocalBalance < -0.005 || nextUsdBalance < -0.005) {
        return {
          ok: false as const,
          error: "No se puede reducir este cargo porque ya fue cubierto por pagos posteriores",
          status: 409 as const,
        };
      }

      await tx`
        UPDATE credit_cards
        SET balance = ${Math.max(0, nextLocalBalance)},
            balance_usd = ${Math.max(0, nextUsdBalance)},
            updated_at = NOW(),
            updated_by = ${userId}
        WHERE id = ${existing.credit_card_id} AND org_id = ${orgId}
      `;

      const categoryValue = category !== undefined ? category?.trim() || null : existing.category;
      const descriptionValue = description !== undefined ? description?.trim() || null : existing.description;
      const [updated] = await tx`
        UPDATE credit_card_transactions SET
          description   = ${descriptionValue},
          category      = ${categoryValue},
          occurred_at   = ${occurred_at ?? existing.occurred_at},
          amount        = ${newAmount},
          currency      = ${newCurrency},
          exchange_rate = ${newExchangeRate},
          amount_local  = ${newAmountLocal},
          updated_by    = ${userId}
        WHERE id = ${txId} AND org_id = ${orgId}
        RETURNING *
      `;

      return { ok: true as const, data: updated };
    });

    if (!result.ok) return createErrorResponse(result.error, result.status);
    return Response.json({ data: result.data });
  } catch (error) {
    console.error("PATCH /api/credit-card-transactions/[id]:", error);
    return createErrorResponse("Error al actualizar transacción", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canDelete', 'CREDIT_CARDS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const txId = Number(id);

    if (!Number.isSafeInteger(txId) || txId <= 0)
      return createErrorResponse("Transacción no encontrada", 404);

    const result = await withTransaction(async (tx) => {
      const [existing] = await tx`
        SELECT id, type, amount, currency, credit_card_id, sale_id, purchase_batch_id
        FROM credit_card_transactions
        WHERE id = ${txId} AND org_id = ${orgId}
        FOR UPDATE
      `;
      if (!existing)
        return { ok: false as const, error: "Transacción no encontrada", status: 404 as const };
      if (
        existing.type !== "CHARGE" ||
        existing.sale_id !== null ||
        existing.purchase_batch_id !== null
      ) {
        return { ok: false as const, error: "Esta transacción está vinculada y debe eliminarse desde su origen", status: 422 as const };
      }

      const [card] = await tx`
        SELECT id, balance, balance_usd
        FROM credit_cards
        WHERE id = ${existing.credit_card_id} AND org_id = ${orgId}
        FOR UPDATE
      `;
      if (!card) return { ok: false as const, error: "Tarjeta no encontrada", status: 404 as const };

      const amountValue = Number(existing.amount);
      const nextLocalBalance = Number(card.balance) - (existing.currency === "USD" ? 0 : amountValue);
      const nextUsdBalance = Number(card.balance_usd) - (existing.currency === "USD" ? amountValue : 0);
      if (nextLocalBalance < -0.005 || nextUsdBalance < -0.005) {
        return {
          ok: false as const,
          error: "No se puede eliminar este cargo porque ya fue cubierto por pagos posteriores",
          status: 409 as const,
        };
      }

      await tx`
        UPDATE credit_cards
        SET balance = ${Math.max(0, nextLocalBalance)},
            balance_usd = ${Math.max(0, nextUsdBalance)},
            updated_at = NOW(),
            updated_by = ${userId}
        WHERE id = ${existing.credit_card_id} AND org_id = ${orgId}
      `;

      await tx`
        DELETE FROM credit_card_transactions
        WHERE id = ${txId} AND org_id = ${orgId}
      `;

      return { ok: true as const };
    });

    if (!result.ok) return createErrorResponse(result.error, result.status);

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/credit-card-transactions/[id]:", error);
    return createErrorResponse("Error al eliminar transacción", 500);
  }
}
