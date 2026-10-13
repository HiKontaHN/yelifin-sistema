import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  createErrorResponse,
  isAuthSuccess,
  verifyAuth,
} from "@/lib/auth";
import { getUtcBounds } from "@/lib/date-bounds";

const sql = neon(process.env.DATABASE_URL!);

type PermissionRow = {
  subitem: "TRANSACTIONS" | "ACCOUNTS" | "CREDIT_CARDS";
  can_view: boolean;
};

function parseOptionalId(value: string | null) {
  if (value === null) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : Number.NaN;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { orgId, roleId, isOwner } = auth.data;
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source") ?? "all";
    const accountId = parseOptionalId(searchParams.get("account_id"));
    const cardId = parseOptionalId(searchParams.get("card_id"));
    const type = searchParams.get("type") || null;
    const search = searchParams.get("search")?.trim() || null;

    if (!['all', 'account', 'credit_card'].includes(source)) {
      return createErrorResponse("Fuente de transacción inválida", 400);
    }
    if (Number.isNaN(accountId) || Number.isNaN(cardId)) {
      return createErrorResponse("Identificador inválido", 400);
    }
    if (type && !["INCOME", "EXPENSE", "TRANSFER"].includes(type)) {
      return createErrorResponse("Tipo de transacción inválido", 400);
    }

    let canViewAccounts = true;
    let canViewCards = true;

    // Un solo acceso a permisos cubre toda la vista consolidada. El owner
    // conserva el bypass habitual y no genera esta consulta.
    if (!isOwner) {
      const permissionRows = await sql`
        SELECT subitem, can_view
        FROM org_role_permissions
        WHERE role_id = ${roleId}
          AND module = 'FINANCES'
          AND subitem = ANY(${["TRANSACTIONS", "ACCOUNTS", "CREDIT_CARDS"]})
      ` as PermissionRow[];
      const permissions = new Map(permissionRows.map((row) => [row.subitem, row.can_view]));
      if (permissions.get("TRANSACTIONS") !== true) {
        return createErrorResponse("Sin acceso a este módulo", 403);
      }
      canViewAccounts = permissions.get("ACCOUNTS") === true;
      canViewCards = permissions.get("CREDIT_CARDS") === true;
    }

    const { startISO, endISO } = getUtcBounds(searchParams);
    const limit = search ? 1000 : 500;
    const includeAccountMovements = source !== "credit_card";
    const includeCardMovements = source !== "account" && canViewCards;

    // Todas las consultas independientes arrancan juntas. Así la pantalla
    // paga una sola ida HTTP y el tiempo total se acerca al de la consulta
    // más lenta, no a la suma de todos los endpoints anteriores.
    const [transactions, totalsRows, creditCardTransactions, periods, accounts, creditCards] =
      await Promise.all([
        includeAccountMovements
          ? sql`
              SELECT
                t.id, t.type, t.amount, t.category, t.description,
                t.reference_type, t.reference_id, t.occurred_at,
                t.created_at, t.deleted_at,
                a.id AS account_id, a.name AS account_name, a.type AS account_type,
                ta.id AS to_account_id, ta.name AS to_account_name
              FROM transactions t
              JOIN accounts a ON a.id = t.account_id
              LEFT JOIN accounts ta ON ta.id = t.to_account_id
              WHERE t.org_id = ${orgId}
                ${search ? sql`` : sql`AND t.occurred_at >= ${startISO}::timestamptz AND t.occurred_at < ${endISO}::timestamptz`}
                ${search ? sql`AND t.description ILIKE ${"%" + search + "%"}` : sql``}
                ${accountId ? sql`AND (t.account_id = ${accountId} OR t.to_account_id = ${accountId})` : sql``}
                ${type ? sql`AND t.type = ${type}` : sql``}
              ORDER BY t.occurred_at DESC
              LIMIT ${limit}
            `
          : Promise.resolve([]),
        includeAccountMovements
          ? sql`
              SELECT
                COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS total_expense,
                COALESCE(SUM(CASE WHEN type = 'TRANSFER' THEN amount ELSE 0 END), 0) AS total_transfer,
                COUNT(*)::int AS total_count
              FROM transactions t
              WHERE t.org_id = ${orgId}
                AND t.deleted_at IS NULL
                ${search ? sql`` : sql`AND t.occurred_at >= ${startISO}::timestamptz AND t.occurred_at < ${endISO}::timestamptz`}
                ${search ? sql`AND t.description ILIKE ${"%" + search + "%"}` : sql``}
                ${accountId ? sql`AND (t.account_id = ${accountId} OR t.to_account_id = ${accountId})` : sql``}
            `
          : Promise.resolve([]),
        includeCardMovements
          ? sql`
              SELECT
                cct.id, cct.credit_card_id, cc.name AS card_name, cc.last_four,
                cct.type, cct.description, cct.amount, cct.currency,
                cct.exchange_rate, cct.amount_local, cct.category,
                cct.sale_id, cct.purchase_batch_id, cct.account_transaction_id,
                cct.occurred_at, cct.created_at, s.sale_number,
                a.name AS account_name
              FROM credit_card_transactions cct
              JOIN credit_cards cc ON cc.id = cct.credit_card_id
              LEFT JOIN sales s ON s.id = cct.sale_id
              LEFT JOIN transactions t ON t.id = cct.account_transaction_id
              LEFT JOIN accounts a ON a.id = t.account_id
              WHERE cct.org_id = ${orgId}
                ${search ? sql`` : sql`AND cct.occurred_at >= ${startISO}::timestamptz AND cct.occurred_at < ${endISO}::timestamptz`}
                ${search ? sql`AND (
                  cct.description ILIKE ${"%" + search + "%"}
                  OR cct.category ILIKE ${"%" + search + "%"}
                  OR s.sale_number ILIKE ${"%" + search + "%"}
                )` : sql``}
                ${cardId ? sql`AND cct.credit_card_id = ${cardId}` : sql``}
              ORDER BY cct.occurred_at DESC
              LIMIT ${limit}
            `
          : Promise.resolve([]),
        canViewCards
          ? sql`
              SELECT DISTINCT year, month
              FROM (
                SELECT
                  EXTRACT(YEAR FROM occurred_at)::int AS year,
                  EXTRACT(MONTH FROM occurred_at)::int AS month
                FROM transactions
                WHERE org_id = ${orgId}
                UNION ALL
                SELECT
                  EXTRACT(YEAR FROM occurred_at)::int AS year,
                  EXTRACT(MONTH FROM occurred_at)::int AS month
                FROM credit_card_transactions
                WHERE org_id = ${orgId}
              ) available_periods
              ORDER BY year DESC, month DESC
            `
          : sql`
              SELECT DISTINCT
                EXTRACT(YEAR FROM occurred_at)::int AS year,
                EXTRACT(MONTH FROM occurred_at)::int AS month
              FROM transactions
              WHERE org_id = ${orgId}
              ORDER BY year DESC, month DESC
            `,
        sql`
          SELECT id, name, type, balance, is_active, created_at
          FROM accounts
          WHERE org_id = ${orgId} AND is_active = TRUE
          ORDER BY name ASC
        `,
        canViewCards
          ? sql`
              SELECT
                id, public_id, name, last_four, credit_limit,
                statement_closing_day, payment_due_day,
                balance, balance_usd, is_active, created_at, updated_at
              FROM credit_cards
              WHERE org_id = ${orgId} AND is_active = TRUE
              ORDER BY name ASC
            `
          : Promise.resolve([]),
      ]);

    const totals = totalsRows[0] ?? {};
    const accountPayload = canViewAccounts
      ? accounts
      : accounts.map((account) => ({ ...account, balance: null }));

    return Response.json({
      data: {
        transactions,
        credit_card_transactions: creditCardTransactions,
        periods,
        accounts: accountPayload,
        credit_cards: creditCards,
      },
      totals: {
        income: Number(totals.total_income ?? 0),
        expense: Number(totals.total_expense ?? 0),
        transfer: Number(totals.total_transfer ?? 0),
        count: Number(totals.total_count ?? 0),
      },
    });
  } catch (error) {
    console.error("GET /api/finances/transactions-view:", error);
    return createErrorResponse("Error al obtener la vista de transacciones", 500);
  }
}
