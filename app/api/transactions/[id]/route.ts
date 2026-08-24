// app/api/transactions/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canDelete');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const transactionId = Number(id);

    if (isNaN(transactionId)) return createErrorResponse("ID inválido", 400);

    // 1. Obtener la transacción con sus cuentas
    const [transaction] = await sql`
      SELECT id, type, amount, account_id, to_account_id
      FROM transactions
      WHERE id = ${transactionId} AND org_id = ${orgId} AND deleted_at IS NULL
    `;

    if (!transaction) return createErrorResponse("Transacción no encontrada", 404);

    const amt = Number(transaction.amount);

    // 2. Revertir balances según el tipo
    if (transaction.type === "INCOME") {
      // Se sumó al account → restar
      await sql`
        UPDATE accounts SET balance = balance - ${amt}
        WHERE id = ${transaction.account_id} AND org_id = ${orgId}
      `;
    } else if (transaction.type === "EXPENSE") {
      // Se restó del account → sumar de vuelta
      await sql`
        UPDATE accounts SET balance = balance + ${amt}
        WHERE id = ${transaction.account_id} AND org_id = ${orgId}
      `;
    } else if (transaction.type === "TRANSFER") {
      // Se restó del origen y se sumó al destino → invertir ambos
      await sql`
        UPDATE accounts SET balance = balance + ${amt}
        WHERE id = ${transaction.account_id} AND org_id = ${orgId}
      `;
      await sql`
        UPDATE accounts SET balance = balance - ${amt}
        WHERE id = ${transaction.to_account_id} AND org_id = ${orgId}
      `;
    }

    // 3. Eliminar la transacción
    await sql`
      DELETE FROM transactions
      WHERE id = ${transactionId} AND org_id = ${orgId}
    `;

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
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const transactionId = Number(id);

    if (isNaN(transactionId)) return createErrorResponse("ID inválido", 400);

    const body = await request.json();
    const { amount, account_id, to_account_id, category, description, occurred_at } = body;

    // 1. Obtener transacción actual
    const [old] = await sql`
      SELECT id, type, amount, account_id, to_account_id, reference_type
      FROM transactions
      WHERE id = ${transactionId} AND org_id = ${orgId} AND deleted_at IS NULL
    `;

    if (!old) return createErrorResponse("Transacción no encontrada", 404);

    if (old.reference_type === "SALE" || old.reference_type === "PURCHASE") {
      return createErrorResponse(
        "Esta transacción está vinculada a una venta/compra. Edítala desde ahí.",
        422
      );
    }

    const oldAmt = Number(old.amount);
    const newAmt = amount ? Number(amount) : oldAmt;
    const newAccountId = account_id ?? old.account_id;
    const newToAccountId = to_account_id ?? old.to_account_id;

    if (newAmt <= 0) return createErrorResponse("El monto debe ser mayor a 0", 400);

    // 2. Revertir efecto de la transacción VIEJA
    if (old.type === "INCOME") {
      await sql`UPDATE accounts SET balance = balance - ${oldAmt} WHERE id = ${old.account_id} AND org_id = ${orgId}`;
    } else if (old.type === "EXPENSE") {
      await sql`UPDATE accounts SET balance = balance + ${oldAmt} WHERE id = ${old.account_id} AND org_id = ${orgId}`;
    } else if (old.type === "TRANSFER") {
      await sql`UPDATE accounts SET balance = balance + ${oldAmt} WHERE id = ${old.account_id}    AND org_id = ${orgId}`;
      await sql`UPDATE accounts SET balance = balance - ${oldAmt} WHERE id = ${old.to_account_id} AND org_id = ${orgId}`;
    }

    // 3. Validar cuentas nuevas
    const [newAccount] = await sql`
      SELECT id FROM accounts WHERE id = ${newAccountId} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!newAccount) return createErrorResponse("Cuenta origen no encontrada", 404);

    if (old.type === "TRANSFER") {
      if (!newToAccountId) return createErrorResponse("La cuenta destino es requerida", 400);
      if (newAccountId === newToAccountId) return createErrorResponse("Las cuentas deben ser diferentes", 400);

      const [newToAccount] = await sql`
        SELECT id FROM accounts WHERE id = ${newToAccountId} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!newToAccount) return createErrorResponse("Cuenta destino no encontrada", 404);
    }

    // 4. Aplicar efecto de la transacción NUEVA
    if (old.type === "INCOME") {
      await sql`UPDATE accounts SET balance = balance + ${newAmt} WHERE id = ${newAccountId} AND org_id = ${orgId}`;
    } else if (old.type === "EXPENSE") {
      await sql`UPDATE accounts SET balance = balance - ${newAmt} WHERE id = ${newAccountId} AND org_id = ${orgId}`;
    } else if (old.type === "TRANSFER") {
      await sql`UPDATE accounts SET balance = balance - ${newAmt} WHERE id = ${newAccountId}    AND org_id = ${orgId}`;
      await sql`UPDATE accounts SET balance = balance + ${newAmt} WHERE id = ${newToAccountId} AND org_id = ${orgId}`;
    }

    // 5. Actualizar la transacción
    const [updated] = await sql`
      UPDATE transactions SET
        amount        = ${newAmt},
        account_id    = ${newAccountId},
        to_account_id = ${old.type === "TRANSFER" ? newToAccountId : null},
        category      = ${category    ?? old.category},
        description   = ${description ?? old.description},
        occurred_at   = ${occurred_at ?? old.occurred_at},
        updated_by    = ${userId}
      WHERE id = ${transactionId} AND org_id = ${orgId}
      RETURNING *
    `;

    return Response.json({ message: "Transacción actualizada", data: updated });
  } catch (error) {
    console.error("PATCH /api/transactions/[id]:", error);
    return createErrorResponse("Error al editar transacción", 500);
  }
}