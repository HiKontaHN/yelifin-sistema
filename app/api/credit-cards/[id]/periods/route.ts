// app/api/credit-cards/[id]/periods/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuthAndSubscription, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuthAndSubscription(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const feature = await requireFeature(auth.data.orgId, "finances.transactions");
  if (feature) return feature;
  const deny = await requireModule(auth.data, 'FINANCES', 'canView', 'CREDIT_CARDS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;

    const [card] = await sql`
      SELECT id FROM credit_cards WHERE id = ${Number(id)} AND org_id = ${orgId}
    `;
    if (!card) return createErrorResponse("Tarjeta no encontrada", 404);

    const periods = await sql`
      SELECT DISTINCT
        EXTRACT(YEAR  FROM effective_date)::int AS year,
        EXTRACT(MONTH FROM effective_date)::int AS month
      FROM credit_card_transactions
      WHERE credit_card_id = ${Number(id)}
        AND org_id = ${orgId}
      ORDER BY year DESC, month DESC
    `;

    return Response.json({ data: periods });
  } catch (error) {
    console.error("GET /api/credit-cards/[id]/periods:", error);
    return createErrorResponse("Error al obtener períodos", 500);
  }
}
