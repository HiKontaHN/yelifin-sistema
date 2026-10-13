import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createErrorResponse, isAuthSuccess, verifyAuth } from "@/lib/auth";
import { getUtcBounds } from "@/lib/date-bounds";

const sql = neon(process.env.DATABASE_URL!);

type PermissionRow = {
  subitem: "ACCOUNTS" | "TRANSACTIONS" | "CREDIT_CARDS";
  can_view: boolean;
};

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { orgId, roleId, isOwner } = auth.data;
    const { searchParams } = new URL(request.url);
    const timezoneOffset = Number(searchParams.get("tz_offset") ?? 0);
    if (!Number.isFinite(timezoneOffset)) {
      return createErrorResponse("Zona horaria inválida", 400);
    }

    let canViewAccounts = true;
    let canViewCards = true;
    if (!isOwner) {
      const permissionRows = await sql`
        SELECT subitem, can_view
        FROM org_role_permissions
        WHERE role_id = ${roleId}
          AND module = 'FINANCES'
          AND subitem = ANY(${["ACCOUNTS", "TRANSACTIONS", "CREDIT_CARDS"]})
      ` as PermissionRow[];
      const permissions = new Map(permissionRows.map((row) => [row.subitem, row.can_view]));
      const canViewTransactions = permissions.get("TRANSACTIONS") === true;
      canViewAccounts = permissions.get("ACCOUNTS") === true;
      canViewCards = permissions.get("CREDIT_CARDS") === true;
      if (!canViewAccounts && !canViewTransactions) {
        return createErrorResponse("Sin acceso a este módulo", 403);
      }
    }

    const { startISO, endISO } = getUtcBounds(searchParams);
    const offsetMs = timezoneOffset * 60_000;
    const localNow = new Date(Date.now() - offsetMs);
    const todayStart = new Date(Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
    ) + offsetMs);
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const [summaryRows, accountRows, cardRows] = await Promise.all([
      sql`
        WITH period_transactions AS MATERIALIZED (
          SELECT type, amount, occurred_at
          FROM transactions
          WHERE org_id = ${orgId}
            AND deleted_at IS NULL
            AND occurred_at >= ${startISO}::timestamptz
            AND occurred_at < ${endISO}::timestamptz
        ),
        today_transactions AS MATERIALIZED (
          SELECT
            t.id, t.type, t.amount, t.description, t.category,
            t.reference_type, t.occurred_at,
            a.name AS account_name,
            ta.name AS to_account_name
          FROM transactions t
          JOIN accounts a ON a.id = t.account_id
          LEFT JOIN accounts ta ON ta.id = t.to_account_id
          WHERE t.org_id = ${orgId}
            AND t.deleted_at IS NULL
            AND t.occurred_at >= ${todayStart.toISOString()}::timestamptz
            AND t.occurred_at < ${todayEnd.toISOString()}::timestamptz
        ),
        period_totals AS (
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0) AS income,
            COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS expense
          FROM period_transactions
        ),
        today_totals AS (
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0) AS income,
            COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS expense,
            COUNT(*)::int AS count
          FROM today_transactions
        )
        SELECT
          period_totals.income AS period_income,
          period_totals.expense AS period_expense,
          today_totals.income AS today_income,
          today_totals.expense AS today_expense,
          today_totals.count AS today_count,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'date', daily.date,
                'income', daily.income,
                'expense', daily.expense
              ) ORDER BY daily.date
            ), '[]'::jsonb)
            FROM (
              SELECT
                DATE(occurred_at)::text AS date,
                COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0) AS income,
                COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS expense
              FROM period_transactions
              GROUP BY DATE(occurred_at)
            ) daily
          ) AS cash_flow,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', recent.id,
                'type', recent.type,
                'amount', recent.amount,
                'description', recent.description,
                'category', recent.category,
                'reference_type', recent.reference_type,
                'occurred_at', recent.occurred_at,
                'account_name', recent.account_name,
                'to_account_name', recent.to_account_name
              ) ORDER BY recent.occurred_at DESC
            ), '[]'::jsonb)
            FROM (
              SELECT * FROM today_transactions
              ORDER BY occurred_at DESC
              LIMIT 50
            ) recent
          ) AS recent_transactions,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object('year', periods.year, 'month', periods.month)
              ORDER BY periods.year DESC, periods.month DESC
            ), '[]'::jsonb)
            FROM (
              SELECT DISTINCT
                EXTRACT(YEAR FROM occurred_at)::int AS year,
                EXTRACT(MONTH FROM occurred_at)::int AS month
              FROM transactions
              WHERE org_id = ${orgId}
            ) periods
          ) AS available_periods
        FROM period_totals
        CROSS JOIN today_totals
      `,
      sql`
        SELECT
          a.id, a.name, a.type, a.balance, a.is_active, a.created_at,
          a.balance - COALESCE((
            SELECT SUM(CASE
              WHEN t.type = 'INCOME' AND t.account_id = a.id THEN t.amount
              WHEN t.type = 'EXPENSE' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'TRANSFER' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'TRANSFER' AND t.to_account_id = a.id THEN t.amount
              ELSE 0
            END)
            FROM transactions t
            WHERE t.org_id = ${orgId}
              AND t.deleted_at IS NULL
              AND t.occurred_at >= ${endISO}::timestamptz
              AND (t.account_id = a.id OR t.to_account_id = a.id)
          ), 0) AS historical_balance
        FROM accounts a
        WHERE a.org_id = ${orgId} AND a.is_active = TRUE
        ORDER BY a.created_at ASC
      `,
      sql`
        SELECT
          id, public_id, name, last_four, credit_limit,
          statement_closing_day, payment_due_day,
          balance, balance_usd, is_active, created_at, updated_at
        FROM credit_cards
        WHERE org_id = ${orgId} AND is_active = TRUE
        ORDER BY name ASC
      `,
    ]);

    const summary = summaryRows[0] ?? {};
    const accounts = accountRows.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: canViewAccounts ? account.balance : null,
      is_active: account.is_active,
      created_at: account.created_at,
    }));
    const summaryAccounts = accountRows.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: Number(account.historical_balance),
    }));

    return Response.json({
      data: {
        summary: {
          accounts: summaryAccounts,
          period: {
            income: Number(summary.period_income ?? 0),
            expense: Number(summary.period_expense ?? 0),
          },
          today: {
            income: Number(summary.today_income ?? 0),
            expense: Number(summary.today_expense ?? 0),
            count: Number(summary.today_count ?? 0),
          },
          cash_flow: summary.cash_flow ?? [],
          today_transactions: summary.recent_transactions ?? [],
        },
        periods: summary.available_periods ?? [],
        accounts,
        credit_cards: canViewCards ? cardRows : [],
      },
    });
  } catch (error) {
    console.error("GET /api/finances/view:", error);
    return createErrorResponse("Error al obtener la vista financiera", 500);
  }
}
