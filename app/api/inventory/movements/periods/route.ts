// app/api/inventory/movements/periods/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canView', 'MOVEMENTS');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;

    const periods = await sql`
      SELECT DISTINCT
        EXTRACT(YEAR  FROM created_at)::int AS year,
        EXTRACT(MONTH FROM created_at)::int AS month
      FROM inventory_movements
      WHERE org_id = ${orgId}
      ORDER BY year DESC, month DESC
    `;

    return Response.json({ data: periods });
  } catch (error) {
    console.error(" GET /api/inventory/movements/periods:", error);
    return createErrorResponse("Error al obtener períodos", 500);
  }
}
