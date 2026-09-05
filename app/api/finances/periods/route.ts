// app/api/finances/periods/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireAnySubitem } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  // Períodos cruza cuentas y transacciones — basta con ver alguno de los dos.
  const deny = await requireAnySubitem(auth.data, 'FINANCES', ['ACCOUNTS', 'TRANSACTIONS'], 'canView');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const periods = await sql`
      SELECT DISTINCT
        EXTRACT(YEAR  FROM occurred_at)::int AS year,
        EXTRACT(MONTH FROM occurred_at)::int AS month
      FROM transactions
      WHERE org_id = ${orgId}
      ORDER BY year DESC, month DESC
    `;
    return Response.json({ data: periods });
  } catch (error) {
    console.error(" GET /api/finances/periods:", error);
    return createErrorResponse("Error al obtener períodos", 500);
  }
}