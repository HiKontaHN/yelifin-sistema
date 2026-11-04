import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  createErrorResponse,
  getModulePermissions,
  isAuthSuccess,
  requireModule,
  verifyAuth,
} from "@/lib/auth";
import { getCalendarBounds } from "@/lib/date-bounds";
import { getCreditCardCycleStart } from "@/lib/credit-card-cycle";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  const deny = await requireModule(auth.data, "FINANCES", "canView", "CREDIT_CARDS");
  if (deny) return deny;

  try {
    const { orgId, timezone } = auth.data;
    const { id } = await params;
    const cardId = Number(id);
    if (!Number.isSafeInteger(cardId) || cardId <= 0) {
      return createErrorResponse("Identificador de tarjeta inválido", 400);
    }

    const { searchParams } = new URL(request.url);
    const { startDate, endDate } = getCalendarBounds(searchParams, timezone);

    const [card] = await sql`
      SELECT
        id, public_id, name, last_four, credit_limit,
        statement_closing_day, payment_due_day,
        balance, balance_usd, is_active, created_at, updated_at
      FROM credit_cards
      WHERE id = ${cardId} AND org_id = ${orgId}
    `;
    if (!card) return createErrorResponse("Tarjeta no encontrada", 404);

    const cycleStart = getCreditCardCycleStart(
      card.statement_closing_day as number | null,
      timezone,
    );

    const [
      statementRows,
      transactions,
      totalsRows,
      periods,
      accounts,
      creditCards,
      accountPermissions,
    ] = await Promise.all([
      sql`
        SELECT
          COALESCE(SUM(
            CASE WHEN type = 'CHARGE' AND currency != 'USD' THEN amount ELSE 0 END
          ), 0) AS statement_balance_local,
          COALESCE(SUM(
            CASE WHEN type = 'CHARGE' AND currency = 'USD' THEN amount ELSE 0 END
          ), 0) AS statement_balance_usd
        FROM credit_card_transactions
        WHERE credit_card_id = ${cardId}
          AND org_id = ${orgId}
          AND effective_date >= ${cycleStart}::date
      `,
      sql`
        SELECT
          cct.id, cct.type, cct.description, cct.amount, cct.currency,
          cct.exchange_rate, cct.amount_local, cct.category,
          cct.sale_id, cct.purchase_batch_id, cct.account_transaction_id,
          cct.effective_date::text AS effective_date,
          cct.occurred_at, cct.created_at, s.sale_number,
          a.name AS account_name
        FROM credit_card_transactions cct
        LEFT JOIN sales s ON s.id = cct.sale_id
        LEFT JOIN transactions t ON t.id = cct.account_transaction_id
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE cct.credit_card_id = ${cardId}
          AND cct.org_id = ${orgId}
          AND cct.effective_date >= ${startDate}::date
          AND cct.effective_date < ${endDate}::date
        ORDER BY cct.effective_date DESC, cct.id DESC
        LIMIT 500
      `,
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'CHARGE' AND currency != 'USD' THEN amount ELSE 0 END), 0) AS total_charges_local,
          COALESCE(SUM(CASE WHEN type = 'CHARGE' AND currency = 'USD' THEN amount ELSE 0 END), 0) AS total_charges_usd,
          COALESCE(SUM(CASE WHEN type = 'PAYMENT' AND currency != 'USD' THEN amount ELSE 0 END), 0) AS total_payments_local,
          COALESCE(SUM(CASE WHEN type = 'PAYMENT' AND currency = 'USD' THEN amount ELSE 0 END), 0) AS total_payments_usd,
          COUNT(*)::int AS total_count
        FROM credit_card_transactions
        WHERE credit_card_id = ${cardId}
          AND org_id = ${orgId}
          AND effective_date >= ${startDate}::date
          AND effective_date < ${endDate}::date
      `,
      sql`
        SELECT DISTINCT
          EXTRACT(YEAR FROM effective_date)::int AS year,
          EXTRACT(MONTH FROM effective_date)::int AS month
        FROM credit_card_transactions
        WHERE credit_card_id = ${cardId} AND org_id = ${orgId}
        ORDER BY year DESC, month DESC
      `,
      sql`
        SELECT id, name, type, balance, is_active, created_at
        FROM accounts
        WHERE org_id = ${orgId} AND is_active = TRUE
        ORDER BY name ASC
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
      getModulePermissions(auth.data, "FINANCES", "ACCOUNTS"),
    ]);

    const statement = statementRows[0] ?? {};
    const totals = totalsRows[0] ?? {};
    const accountPayload = accountPermissions.canView
      ? accounts
      : accounts.map((account) => ({ ...account, balance: null }));

    return Response.json({
      data: {
        credit_card: {
          ...card,
          statement_balance_local: Number(statement.statement_balance_local ?? 0),
          statement_balance_usd: Number(statement.statement_balance_usd ?? 0),
          cycle_start: cycleStart,
        },
        transactions,
        periods,
        accounts: accountPayload,
        credit_cards: creditCards,
      },
      totals: {
        charges_local: Number(totals.total_charges_local ?? 0),
        charges_usd: Number(totals.total_charges_usd ?? 0),
        payments_local: Number(totals.total_payments_local ?? 0),
        payments_usd: Number(totals.total_payments_usd ?? 0),
        count: Number(totals.total_count ?? 0),
      },
    });
  } catch (error) {
    console.error("GET /api/credit-cards/[id]/view:", error);
    return createErrorResponse("Error al obtener el detalle de la tarjeta", 500);
  }
}
