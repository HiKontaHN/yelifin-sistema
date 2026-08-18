// app/api/industries/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

// GET /api/industries — catálogo para el selector de onboarding/settings.
// Autenticado (no público): se usa dentro de la app, no en la landing.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const industries = await sql`
      SELECT id, slug, name
      FROM industries
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC
    `;

    return Response.json({ data: industries });
  } catch (error) {
    console.error("GET /api/industries:", error);
    return createErrorResponse("Error al obtener industrias", 500);
  }
}
