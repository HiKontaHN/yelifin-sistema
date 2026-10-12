// app/api/transactions/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, verifyResourceLimit } from "@/lib/auth";
import { getUtcBounds } from "@/lib/date-bounds";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canView', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);

    const accountId = searchParams.get("account_id");
    const type      = searchParams.get("type") || null; // INCOME | EXPENSE | TRANSFER | null
    const search    = searchParams.get("search")?.trim() || null;

    const { startISO, endISO } = getUtcBounds(searchParams);
    const limit = search ? 1000 : 500;

    const transactions = await sql`
      SELECT
        t.id,
        t.type,
        t.amount,
        t.category,
        t.description,
        t.reference_type,
        t.reference_id,
        t.occurred_at,
        t.created_at,
        t.deleted_at,
        a.id   AS account_id,
        a.name AS account_name,
        a.type AS account_type,
        ta.id   AS to_account_id,
        ta.name AS to_account_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      LEFT JOIN accounts ta ON ta.id = t.to_account_id
      WHERE t.org_id = ${orgId}
        ${search ? sql`` : sql`AND t.occurred_at >= ${startISO}::timestamptz AND t.occurred_at < ${endISO}::timestamptz`}
        ${search ? sql`AND t.description ILIKE ${"%" + search + "%"}` : sql``}
        ${accountId ? sql`AND (t.account_id = ${Number(accountId)} OR t.to_account_id = ${Number(accountId)})` : sql``}
        ${type ? sql`AND t.type = ${type}` : sql``}
      ORDER BY t.occurred_at DESC
      LIMIT ${limit}
    `;

    const [totals] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME'   THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE'  THEN amount ELSE 0 END), 0) AS total_expense,
        COALESCE(SUM(CASE WHEN type = 'TRANSFER' THEN amount ELSE 0 END), 0) AS total_transfer,
        COUNT(*)::int AS total_count
      FROM transactions t
      WHERE t.org_id = ${orgId}
        AND t.deleted_at IS NULL
        ${search ? sql`` : sql`AND t.occurred_at >= ${startISO}::timestamptz AND t.occurred_at < ${endISO}::timestamptz`}
        ${search ? sql`AND t.description ILIKE ${"%" + search + "%"}` : sql``}
        ${accountId ? sql`AND (t.account_id = ${Number(accountId)} OR t.to_account_id = ${Number(accountId)})` : sql``}
    `;

    return Response.json({
      data: transactions,
      totals: {
        income: Number(totals.total_income),
        expense: Number(totals.total_expense),
        transfer: Number(totals.total_transfer),
        count: Number(totals.total_count),
      },
    });
  } catch (error) {
    console.error(" GET /api/transactions:", error);
    return createErrorResponse("Error al obtener transacciones", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit', 'TRANSACTIONS');
  if (deny) return deny;

  const limit = await verifyResourceLimit(auth.data.orgId, "transactions");
  if (!limit.withinLimit) {
    return createErrorResponse(limit.error ?? "Límite alcanzado", limit.status, "needsUpgrade" in limit ? !!limit.needsUpgrade : false);
  }

  try {
    const { userId, orgId } = auth.data;
    const body = await request.json();
    const {
      type, account_id, to_account_id, amount,
      category, description, occurred_at,
      reference_type, reference_id,
      // Tarjeta de crédito (solo para EXPENSE)
      credit_card_id, currency, exchange_rate,
    } = body;

    if (!type || !["INCOME", "EXPENSE", "TRANSFER"].includes(type))
      return createErrorResponse("Tipo de transacción inválido", 400);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
      return createErrorResponse("El monto debe ser mayor a 0", 400);

    const isCreditCardExpense = type === "EXPENSE" && !!credit_card_id;
    const sourceAccountId = account_id === undefined || account_id === null
      ? null
      : Number(account_id);
    const destinationAccountId = to_account_id === undefined || to_account_id === null
      ? null
      : Number(to_account_id);

    if (!isCreditCardExpense && (!Number.isSafeInteger(sourceAccountId) || Number(sourceAccountId) <= 0))
      return createErrorResponse("La cuenta es requerida", 400);
    if (type === "TRANSFER" && (!Number.isSafeInteger(destinationAccountId) || Number(destinationAccountId) <= 0))
      return createErrorResponse("La cuenta destino es requerida", 400);
    if (type === "TRANSFER" && sourceAccountId === destinationAccountId)
      return createErrorResponse("Las cuentas deben ser diferentes", 400);

    const occurredAt = occurred_at ?? new Date().toISOString();

    // ── Egreso con tarjeta de crédito ──────────────────────────────────
    if (isCreditCardExpense) {
      const cardId = Number(credit_card_id);
      if (!Number.isSafeInteger(cardId) || cardId <= 0)
        return createErrorResponse("Tarjeta no encontrada", 404);
      const isUsd = currency === "USD";
      const rateNum = isUsd ? Number(exchange_rate) : null;
      if (isUsd && (!Number.isFinite(rateNum) || Number(rateNum) <= 0))
        return createErrorResponse("La tasa de cambio es requerida para cargos en USD", 400);
      const amountLocal = isUsd ? amt * Number(rateNum) : amt;

      const result = await withTransaction(async (tx) => {
        const [card] = await tx`
          SELECT id FROM credit_cards
          WHERE id = ${cardId} AND org_id = ${orgId} AND is_active = TRUE
          FOR UPDATE
        `;
        if (!card) return { ok: false as const, error: "Tarjeta no encontrada", status: 404 as const };

        const [ccTxn] = await tx`
          INSERT INTO credit_card_transactions (
            org_id, created_by, credit_card_id, type, description,
            amount, currency, exchange_rate, amount_local, category, occurred_at
          ) VALUES (
            ${orgId}, ${userId}, ${cardId}, 'CHARGE',
            ${description ?? null},
            ${amt}, ${currency ?? "LOCAL"}, ${rateNum}, ${amountLocal},
            ${category ?? null},
            ${occurredAt}
          )
          RETURNING id
        `;

        if (isUsd) {
          await tx`UPDATE credit_cards SET balance_usd = balance_usd + ${amt}, updated_at = NOW(), updated_by = ${userId} WHERE id = ${cardId} AND org_id = ${orgId}`;
        } else {
          await tx`UPDATE credit_cards SET balance = balance + ${amt}, updated_at = NOW(), updated_by = ${userId} WHERE id = ${cardId} AND org_id = ${orgId}`;
        }

        return { ok: true as const, id: Number(ccTxn.id) };
      });

      if (!result.ok) return createErrorResponse(result.error, result.status);

      return Response.json(
        { message: "Cargo a tarjeta registrado", data: { id: result.id } },
        { status: 201 }
      );
    }

    // ── Transacción normal (cuenta) ────────────────────────────────────
    const VALID_REF_TYPES = ["SALE", "PURCHASE", "SUPPLY_PURCHASE", "EVENT", "OTHER", "CREDIT_CARD_PAYMENT"];
    const refType = reference_type && VALID_REF_TYPES.includes(reference_type)
      ? reference_type
      : "OTHER";
    const refId = reference_id ? Number(reference_id) : null;

    const result = await withTransaction(async (tx) => {
      const accountIds = type === "TRANSFER"
        ? [Number(sourceAccountId), Number(destinationAccountId)].sort((a, b) => a - b)
        : [Number(sourceAccountId)];
      const lockedAccounts = [] as Array<{ id: number; is_active: boolean }>;

      for (const accountId of accountIds) {
        const [lockedAccount] = await tx<{ id: number; is_active: boolean }>`
          SELECT id, is_active FROM accounts
          WHERE id = ${accountId} AND org_id = ${orgId}
          FOR UPDATE
        `;
        if (lockedAccount) lockedAccounts.push(lockedAccount);
      }

      const sourceAccount = lockedAccounts.find((account) => Number(account.id) === sourceAccountId);
      if (!sourceAccount?.is_active)
        return { ok: false as const, error: "Cuenta no encontrada", status: 404 as const };

      if (type === "TRANSFER") {
        const destinationAccount = lockedAccounts.find((account) => Number(account.id) === destinationAccountId);
        if (!destinationAccount?.is_active)
          return { ok: false as const, error: "Cuenta destino no encontrada", status: 404 as const };
      }

      const [transaction] = await tx`
        INSERT INTO transactions (
          org_id, created_by, type, account_id, to_account_id,
          amount, category, description,
          reference_type, reference_id, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, ${type}, ${sourceAccountId}, ${type === "TRANSFER" ? destinationAccountId : null},
          ${amt}, ${category ?? null}, ${description ?? null},
          ${refType}, ${refId}, ${occurredAt}
        )
        RETURNING id
      `;

      if (type === "INCOME") {
        await tx`UPDATE accounts SET balance = balance + ${amt}, updated_by = ${userId} WHERE id = ${sourceAccountId} AND org_id = ${orgId}`;
      } else if (type === "EXPENSE") {
        await tx`UPDATE accounts SET balance = balance - ${amt}, updated_by = ${userId} WHERE id = ${sourceAccountId} AND org_id = ${orgId}`;
      } else {
        await tx`UPDATE accounts SET balance = balance - ${amt}, updated_by = ${userId} WHERE id = ${sourceAccountId}      AND org_id = ${orgId}`;
        await tx`UPDATE accounts SET balance = balance + ${amt}, updated_by = ${userId} WHERE id = ${destinationAccountId} AND org_id = ${orgId}`;
      }

      return { ok: true as const, id: Number(transaction.id) };
    });

    if (!result.ok) return createErrorResponse(result.error, result.status);

    return Response.json(
      { message: "Transacción registrada", data: { id: result.id } },
      { status: 201 }
    );
  } catch (error) {
    console.error(" POST /api/transactions:", error);
    return createErrorResponse("Error al registrar transacción", 500);
  }
}
