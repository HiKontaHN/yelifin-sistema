// app/api/finances/summary/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireAnySubitem } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  // Resumen cruza cuentas y transacciones — basta con ver alguno de los dos.
  const deny = await requireAnySubitem(auth.data, 'FINANCES', ['ACCOUNTS', 'TRANSACTIONS'], 'canView');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);

    const month = searchParams.get("month");
    const year  = searchParams.get("year");
    const now   = new Date();

    let startISO: string;
    let endISO:   string;

    if (year && month) {
      const y = Number(year), m = Number(month);
      startISO = new Date(y, m - 1, 1).toISOString();
      endISO   = new Date(y, m, 1).toISOString();
    } else if (year && !month) {
      const y = Number(year);
      startISO = new Date(y, 0, 1).toISOString();
      endISO   = new Date(y + 1, 0, 1).toISOString();
    } else {
      // Por defecto: mes actual
      startISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      endISO   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    }

    // Hoy
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    // Cuentas con balance histórico al final del período
    const accounts = await sql`
      SELECT 
        a.id,
        a.name,
        a.type,
        a.balance - COALESCE(
          (
            SELECT 
              SUM(CASE 
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
          ), 
          0
        ) AS balance
      FROM accounts a
      WHERE a.org_id = ${orgId} AND a.is_active = TRUE
      ORDER BY a.created_at ASC
    `;

    // Totales del período
    const [periodTotals] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense
      FROM transactions
      WHERE org_id = ${orgId}
        AND deleted_at IS NULL
        AND occurred_at >= ${startISO}::timestamptz
        AND occurred_at <  ${endISO}::timestamptz
    `;

    // Totales de hoy
    const [todayTotals] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense,
        COUNT(*)::int AS count
      FROM transactions
      WHERE org_id = ${orgId}
        AND deleted_at IS NULL
        AND occurred_at >= ${todayStart}::timestamptz
        AND occurred_at <  ${todayEnd}::timestamptz
    `;

    // Flujo de efectivo — últimos 30 días del período
    const cashFlow = await sql`
      SELECT
        DATE(occurred_at)::text AS date,
        COALESCE(SUM(CASE WHEN type = 'INCOME'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense
      FROM transactions
      WHERE org_id = ${orgId}
        AND deleted_at IS NULL
        AND occurred_at >= ${startISO}::timestamptz
        AND occurred_at <  ${endISO}::timestamptz
      GROUP BY DATE(occurred_at)
      ORDER BY date ASC
    `;

    // Transacciones de hoy (resumen compacto — se excluyen las canceladas;
    // el ledger completo con insignia "Cancelada" vive en /finances/transactions)
    const todayTransactions = await sql`
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
        AND t.occurred_at >= ${todayStart}::timestamptz
        AND t.occurred_at <  ${todayEnd}::timestamptz
      ORDER BY t.occurred_at DESC
      LIMIT 50
    `;

    return Response.json({
      accounts,
      period: {
        income:  Number(periodTotals.income),
        expense: Number(periodTotals.expense),
      },
      today: {
        income:  Number(todayTotals.income),
        expense: Number(todayTotals.expense),
        count:   Number(todayTotals.count),
      },
      cash_flow:          cashFlow,
      today_transactions: todayTransactions,
    });
  } catch (error) {
    console.error(" GET /api/finances/summary:", error);
    return createErrorResponse("Error al obtener resumen financiero", 500);
  }
}