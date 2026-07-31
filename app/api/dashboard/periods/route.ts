// app/api/dashboard/periods/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'DASHBOARD', 'canView');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;

    const periods = await sql`
      SELECT DISTINCT
        EXTRACT(YEAR  FROM sold_at)::int AS year,
        EXTRACT(MONTH FROM sold_at)::int AS month
      FROM sales
      WHERE org_id = ${orgId}
      ORDER BY year DESC, month DESC
    `;

    return Response.json({ data: periods });
  } catch (error) {
    console.error(" GET /api/dashboard/periods:", error);
    return createErrorResponse("Error al obtener períodos", 500);
  }
}