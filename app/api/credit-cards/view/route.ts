import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  createErrorResponse,
  getModulePermissions,
  isAuthSuccess,
  requireModule,
  verifyAuth,
} from "@/lib/auth";
import { getUtcBounds } from "@/lib/date-bounds";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  const deny = await requireModule(auth.data, "FINANCES", "canView", "CREDIT_CARDS");
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const cardIdValue = searchParams.get("card_id");
    const cardId = cardIdValue === null ? null : Number(cardIdValue);
    if (cardId !== null && (!Number.isSafeInteger(cardId) || cardId <= 0)) {
      return createErrorResponse("Identificador de tarjeta inválido", 400);
    }

    const { startISO, endISO } = getUtcBounds(searchParams);
    const [creditCards, accounts, periods, transactions, accountPermissions] =
      await Promise.all([
        sql`
          SELECT
            id, public_id, name, last_four, credit_limit,
            statement_closing_day, payment_due_day,
            balance, balance_usd, is_active, created_at, updated_at
          FROM credit_cards
          WHERE org_id = ${orgId} AND is_active = TRUE
          ORDER BY name ASC
        `,
        sql`
          SELECT id, name, type, balance, is_active, created_at
          FROM accounts
          WHERE org_id = ${orgId} AND is_active = TRUE
          ORDER BY name ASC
        `,
        sql`
          SELECT DISTINCT
            EXTRACT(YEAR FROM occurred_at)::int AS year,
            EXTRACT(MONTH FROM occurred_at)::int AS month
          FROM credit_card_transactions
          WHERE org_id = ${orgId}
          ORDER BY year DESC, month DESC
        `,
        sql`
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
            AND cct.occurred_at >= ${startISO}::timestamptz
            AND cct.occurred_at < ${endISO}::timestamptz
            AND (${cardId}::bigint IS NULL OR cct.credit_card_id = ${cardId})
          ORDER BY cct.occurred_at DESC
          LIMIT 500
        `,
        getModulePermissions(auth.data, "FINANCES", "ACCOUNTS"),
      ]);

    const accountPayload = accountPermissions.canView
      ? accounts
      : accounts.map((account) => ({ ...account, balance: null }));

    return Response.json({
      data: {
        credit_cards: creditCards,
        accounts: accountPayload,
        periods,
        transactions,
      },
    });
  } catch (error) {
    console.error("GET /api/credit-cards/view:", error);
    return createErrorResponse("Error al obtener el resumen de tarjetas", 500);
  }
}
