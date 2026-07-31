// app/api/credit-card-transactions/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { getUtcBounds } from "@/lib/date-bounds";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canView');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);

    const cardId = searchParams.get("card_id");
    const search = searchParams.get("search")?.trim() || null;

    const { startISO, endISO } = getUtcBounds(searchParams);
    const limit = search ? 1000 : 500;

    const rows = await sql`
      SELECT
        cct.id,
        cct.credit_card_id,
        cc.name        AS card_name,
        cc.last_four,
        cct.type,
        cct.description,
        cct.amount,
        cct.currency,
        cct.exchange_rate,
        cct.amount_local,
        cct.category,
        cct.sale_id,
        cct.account_transaction_id,
        cct.occurred_at,
        cct.created_at,
        s.sale_number,
        a.name         AS account_name
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
        ${cardId ? sql`AND cct.credit_card_id = ${Number(cardId)}` : sql``}
      ORDER BY cct.occurred_at DESC
      LIMIT ${limit}
    `;

    return Response.json({ data: rows });
  } catch (error) {
    console.error("GET /api/credit-card-transactions:", error);
    return createErrorResponse("Error al obtener movimientos", 500);
  }
}
