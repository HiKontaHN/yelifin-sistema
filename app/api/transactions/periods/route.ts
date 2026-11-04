// app/api/transactions/periods/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuthAndSubscription, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuthAndSubscription(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const feature = await requireFeature(auth.data.orgId, "finances.transactions");
  if (feature) return feature;
  const deny = await requireModule(auth.data, 'FINANCES', 'canView', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const periods = await sql`
      SELECT DISTINCT
        EXTRACT(YEAR  FROM effective_date)::int AS year,
        EXTRACT(MONTH FROM effective_date)::int AS month
      FROM transactions
      WHERE org_id = ${orgId}
      ORDER BY year DESC, month DESC
    `;
    return Response.json({ data: periods });
  } catch (error) {
    console.error(" GET /api/transactions/periods:", error);
    return createErrorResponse("Error al obtener períodos", 500);
  }
}
