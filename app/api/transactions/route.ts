// app/api/transactions/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, verifyResourceLimit } from "@/lib/auth";
import { getUtcBounds } from "@/lib/date-bounds";

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
    if (!amount || Number(amount) <= 0)
      return createErrorResponse("El monto debe ser mayor a 0", 400);

    const isCreditCardExpense = type === "EXPENSE" && !!credit_card_id;

    if (!isCreditCardExpense && !account_id)
      return createErrorResponse("La cuenta es requerida", 400);
    if (type === "TRANSFER" && !to_account_id)
      return createErrorResponse("La cuenta destino es requerida", 400);
    if (type === "TRANSFER" && account_id === to_account_id)
      return createErrorResponse("Las cuentas deben ser diferentes", 400);

    const amt = Number(amount);
    const occurredAt = occurred_at ?? new Date().toISOString();

    // ── Egreso con tarjeta de crédito ──────────────────────────────────
    if (isCreditCardExpense) {
      const [card] = await sql`
        SELECT id, balance, balance_usd FROM credit_cards
        WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!card) return createErrorResponse("Tarjeta no encontrada", 404);

      const isUsd = currency === "USD";
      const rateNum = isUsd ? Number(exchange_rate ?? 1) : null;
      const amountLocal = isUsd ? amt * Number(exchange_rate ?? 1) : amt;

      const [ccTxn] = await sql`
        INSERT INTO credit_card_transactions (
          org_id, created_by, credit_card_id, type, description,
          amount, currency, exchange_rate, amount_local, category, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, ${Number(credit_card_id)}, 'CHARGE',
          ${description ?? null},
          ${amt}, ${currency ?? "LOCAL"}, ${rateNum}, ${amountLocal},
          ${category ?? null},
          ${occurredAt}
        )
        RETURNING id
      `;

      if (isUsd) {
        await sql`UPDATE credit_cards SET balance_usd = balance_usd + ${amt}, updated_at = NOW(), updated_by = ${userId} WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId}`;
      } else {
        await sql`UPDATE credit_cards SET balance = balance + ${amt}, updated_at = NOW(), updated_by = ${userId} WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId}`;
      }

      return Response.json(
        { message: "Cargo a tarjeta registrado", data: { id: ccTxn.id } },
        { status: 201 }
      );
    }

    // ── Transacción normal (cuenta) ────────────────────────────────────
    const VALID_REF_TYPES = ["SALE", "PURCHASE", "SUPPLY_PURCHASE", "EVENT", "OTHER", "CREDIT_CARD_PAYMENT"];
    const refType = reference_type && VALID_REF_TYPES.includes(reference_type)
      ? reference_type
      : "OTHER";
    const refId = reference_id ? Number(reference_id) : null;

    const [account] = await sql`
      SELECT id, balance FROM accounts
      WHERE id = ${account_id} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!account) return createErrorResponse("Cuenta no encontrada", 404);

    const [transaction] = await sql`
      INSERT INTO transactions (
        org_id, created_by, type, account_id, to_account_id,
        amount, category, description,
        reference_type, reference_id, occurred_at
      ) VALUES (
        ${orgId}, ${userId}, ${type}, ${account_id}, ${to_account_id ?? null},
        ${amt}, ${category ?? null}, ${description ?? null},
        ${refType}, ${refId}, ${occurredAt}
      )
      RETURNING id
    `;

    if (type === "INCOME") {
      await sql`UPDATE accounts SET balance = balance + ${amt}, updated_by = ${userId} WHERE id = ${account_id} AND org_id = ${orgId}`;
    } else if (type === "EXPENSE") {
      await sql`UPDATE accounts SET balance = balance - ${amt}, updated_by = ${userId} WHERE id = ${account_id} AND org_id = ${orgId}`;
    } else if (type === "TRANSFER") {
      const [toAccount] = await sql`
        SELECT id FROM accounts WHERE id = ${to_account_id} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!toAccount) return createErrorResponse("Cuenta destino no encontrada", 404);
      await sql`UPDATE accounts SET balance = balance - ${amt}, updated_by = ${userId} WHERE id = ${account_id}    AND org_id = ${orgId}`;
      await sql`UPDATE accounts SET balance = balance + ${amt}, updated_by = ${userId} WHERE id = ${to_account_id} AND org_id = ${orgId}`;
    }

    return Response.json(
      { message: "Transacción registrada", data: { id: transaction.id } },
      { status: 201 }
    );
  } catch (error) {
    console.error(" POST /api/transactions:", error);
    return createErrorResponse("Error al registrar transacción", 500);
  }
}