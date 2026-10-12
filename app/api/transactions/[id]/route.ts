// app/api/transactions/[id]/route.ts
import { NextRequest } from "next/server";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canDelete', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const transactionId = Number(id);

    if (isNaN(transactionId)) return createErrorResponse("ID inválido", 400);

    const result = await withTransaction(async (tx) => {
      const [transaction] = await tx`
        SELECT id, type, amount, account_id, to_account_id, reference_type
        FROM transactions
        WHERE id = ${transactionId} AND org_id = ${orgId} AND deleted_at IS NULL
        FOR UPDATE
      `;

      if (!transaction)
        return { ok: false as const, error: "Transacción no encontrada", status: 404 as const };
      if (transaction.reference_type && transaction.reference_type !== "OTHER") {
        return {
          ok: false as const,
          error: "Esta transacción está vinculada a otro movimiento. Elimínala desde su origen.",
          status: 422 as const,
        };
      }

      const accountIds = [...new Set([
        Number(transaction.account_id),
        transaction.type === "TRANSFER" ? Number(transaction.to_account_id) : null,
      ].filter((value): value is number => Number.isSafeInteger(value) && Number(value) > 0))]
        .sort((a, b) => a - b);

      for (const accountId of accountIds) {
        await tx`SELECT id FROM accounts WHERE id = ${accountId} AND org_id = ${orgId} FOR UPDATE`;
      }

      const amt = Number(transaction.amount);
      if (transaction.type === "INCOME") {
        await tx`
          UPDATE accounts SET balance = balance - ${amt}, updated_by = ${userId}
          WHERE id = ${transaction.account_id} AND org_id = ${orgId}
        `;
      } else if (transaction.type === "EXPENSE") {
        await tx`
          UPDATE accounts SET balance = balance + ${amt}, updated_by = ${userId}
          WHERE id = ${transaction.account_id} AND org_id = ${orgId}
        `;
      } else if (transaction.type === "TRANSFER") {
        await tx`
          UPDATE accounts SET balance = balance + ${amt}, updated_by = ${userId}
          WHERE id = ${transaction.account_id} AND org_id = ${orgId}
        `;
        await tx`
          UPDATE accounts SET balance = balance - ${amt}, updated_by = ${userId}
          WHERE id = ${transaction.to_account_id} AND org_id = ${orgId}
        `;
      }

      await tx`
        DELETE FROM transactions
        WHERE id = ${transactionId} AND org_id = ${orgId}
      `;

      return { ok: true as const };
    });

    if (!result.ok) return createErrorResponse(result.error, result.status);

    return Response.json({ message: "Transacción eliminada y balances revertidos" });
  } catch (error) {
    console.error("DELETE /api/transactions/[id]:", error);
    return createErrorResponse("Error al cancelar transacción", 500);
  }
}

// Agregar al mismo app/api/transactions/[id]/route.ts

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const transactionId = Number(id);

    if (isNaN(transactionId)) return createErrorResponse("ID inválido", 400);

    const body = await request.json();
    const { amount, account_id, to_account_id, category, description, occurred_at } = body;

    if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0))
      return createErrorResponse("El monto debe ser mayor a 0", 400);
    if (account_id !== undefined && (!Number.isSafeInteger(Number(account_id)) || Number(account_id) <= 0))
      return createErrorResponse("Cuenta origen no encontrada", 404);
    if (to_account_id !== undefined && (!Number.isSafeInteger(Number(to_account_id)) || Number(to_account_id) <= 0))
      return createErrorResponse("Cuenta destino no encontrada", 404);

    const result = await withTransaction(async (tx) => {
      const [old] = await tx`
        SELECT
          id, type, amount, account_id, to_account_id, reference_type,
          category, description, occurred_at
        FROM transactions
        WHERE id = ${transactionId} AND org_id = ${orgId} AND deleted_at IS NULL
        FOR UPDATE
      `;

      if (!old) return { ok: false as const, error: "Transacción no encontrada", status: 404 as const };
      if (old.reference_type && old.reference_type !== "OTHER") {
        return {
          ok: false as const,
          error: "Esta transacción está vinculada a otro movimiento. Edítala desde su origen.",
          status: 422 as const,
        };
      }

      const oldAmt = Number(old.amount);
      const newAmt = amount !== undefined ? Number(amount) : oldAmt;
      const newAccountId = account_id !== undefined ? Number(account_id) : Number(old.account_id);
      const newToAccountId = old.type === "TRANSFER"
        ? (to_account_id !== undefined ? Number(to_account_id) : Number(old.to_account_id))
        : null;

      if (old.type === "TRANSFER") {
        if (!Number.isSafeInteger(newToAccountId) || Number(newToAccountId) <= 0)
          return { ok: false as const, error: "La cuenta destino es requerida", status: 400 as const };
        if (newAccountId === newToAccountId)
          return { ok: false as const, error: "Las cuentas deben ser diferentes", status: 400 as const };
      }

      const accountIds = [...new Set([
        Number(old.account_id),
        old.type === "TRANSFER" ? Number(old.to_account_id) : null,
        newAccountId,
        old.type === "TRANSFER" ? Number(newToAccountId) : null,
      ].filter((value): value is number => Number.isSafeInteger(value) && Number(value) > 0))]
        .sort((a, b) => a - b);
      const lockedAccounts = [] as Array<{ id: number; is_active: boolean }>;

      for (const accountId of accountIds) {
        const [account] = await tx<{ id: number; is_active: boolean }>`
          SELECT id, is_active FROM accounts
          WHERE id = ${accountId} AND org_id = ${orgId}
          FOR UPDATE
        `;
        if (account) lockedAccounts.push(account);
      }

      const newAccount = lockedAccounts.find((account) => Number(account.id) === newAccountId);
      if (!newAccount?.is_active)
        return { ok: false as const, error: "Cuenta origen no encontrada", status: 404 as const };
      if (old.type === "TRANSFER") {
        const newToAccount = lockedAccounts.find((account) => Number(account.id) === newToAccountId);
        if (!newToAccount?.is_active)
          return { ok: false as const, error: "Cuenta destino no encontrada", status: 404 as const };
      }

      if (old.type === "INCOME") {
        await tx`UPDATE accounts SET balance = balance - ${oldAmt}, updated_by = ${userId} WHERE id = ${old.account_id} AND org_id = ${orgId}`;
      } else if (old.type === "EXPENSE") {
        await tx`UPDATE accounts SET balance = balance + ${oldAmt}, updated_by = ${userId} WHERE id = ${old.account_id} AND org_id = ${orgId}`;
      } else {
        await tx`UPDATE accounts SET balance = balance + ${oldAmt}, updated_by = ${userId} WHERE id = ${old.account_id}    AND org_id = ${orgId}`;
        await tx`UPDATE accounts SET balance = balance - ${oldAmt}, updated_by = ${userId} WHERE id = ${old.to_account_id} AND org_id = ${orgId}`;
      }

      if (old.type === "INCOME") {
        await tx`UPDATE accounts SET balance = balance + ${newAmt}, updated_by = ${userId} WHERE id = ${newAccountId} AND org_id = ${orgId}`;
      } else if (old.type === "EXPENSE") {
        await tx`UPDATE accounts SET balance = balance - ${newAmt}, updated_by = ${userId} WHERE id = ${newAccountId} AND org_id = ${orgId}`;
      } else {
        await tx`UPDATE accounts SET balance = balance - ${newAmt}, updated_by = ${userId} WHERE id = ${newAccountId}    AND org_id = ${orgId}`;
        await tx`UPDATE accounts SET balance = balance + ${newAmt}, updated_by = ${userId} WHERE id = ${newToAccountId}  AND org_id = ${orgId}`;
      }

      const categoryValue = category !== undefined ? category?.trim() || null : old.category;
      const descriptionValue = description !== undefined ? description?.trim() || null : old.description;
      const [updated] = await tx`
        UPDATE transactions SET
          amount        = ${newAmt},
          account_id    = ${newAccountId},
          to_account_id = ${old.type === "TRANSFER" ? newToAccountId : null},
          category      = ${categoryValue},
          description   = ${descriptionValue},
          occurred_at   = ${occurred_at ?? old.occurred_at},
          updated_by    = ${userId}
        WHERE id = ${transactionId} AND org_id = ${orgId}
        RETURNING *
      `;

      return { ok: true as const, data: updated };
    });

    if (!result.ok) return createErrorResponse(result.error, result.status);
    return Response.json({ message: "Transacción actualizada", data: result.data });
  } catch (error) {
    console.error("PATCH /api/transactions/[id]:", error);
    return createErrorResponse("Error al editar transacción", 500);
  }
}
