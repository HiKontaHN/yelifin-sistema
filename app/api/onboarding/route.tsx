import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

// GET /api/onboarding — verificar si el usuario completó el onboarding
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { userId } = auth.data;

    const [profile] = await sql`
      SELECT onboarding_completed, currency
      FROM user_profile
      WHERE user_id = ${userId}
    `;

    return Response.json({
      data: {
        onboarding_completed: profile?.onboarding_completed ?? false,
        currency: profile?.currency ?? "HNL",
        plan_slug: auth.data.subscription.planSlug ?? null,
      },
    });
  } catch (error) {
    console.error(" GET /api/onboarding:", error);
    return createErrorResponse("Error al verificar onboarding", 500);
  }
}

// POST /api/onboarding — completar onboarding
// Body: { currency: string, industry_id?: number, accounts: { name: string, type: string, balance?: number }[] }
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { userId, orgId } = auth.data;
    const body = await request.json();

    const currency = (body?.currency ?? "HNL").toString().trim().toUpperCase();
    const industryId: number | null = body?.industry_id ? Number(body.industry_id) : null;
    const accounts = Array.isArray(body?.accounts) ? body.accounts : [];

    if (!currency || currency.length !== 3)
      return createErrorResponse("Moneda inválida", 400);

    if (industryId !== null) {
      const [industry] = await sql`SELECT id FROM industries WHERE id = ${industryId} AND is_active = TRUE`;
      if (!industry) return createErrorResponse("Industria inválida", 400);
    }

    // La cuenta de efectivo siempre debe estar
    const hasEfectivo = accounts.some(
      (a: any) => (a.type ?? "").toUpperCase() === "CASH"
    );
    if (!hasEfectivo)
      return createErrorResponse("Debe incluir al menos una cuenta de efectivo", 400);

    // Validar cuentas
    const validTypes = ["CASH", "BANK", "WALLET", "OTHER"];
    for (const acc of accounts) {
      if (!acc.name?.trim())
        return createErrorResponse("El nombre de la cuenta es requerido", 400);
      if (!validTypes.includes((acc.type ?? "").toUpperCase()))
        return createErrorResponse(`Tipo de cuenta inválido: ${acc.type}`, 400);
    }

    // Nota: el driver HTTP de Neon ejecuta cada query en una conexión
    // distinta, así que BEGIN/COMMIT no crean una transacción real.
    // Las operaciones son idempotentes (ON CONFLICT), reintentar es seguro.

    // 1. Crear cuentas (si ya existía por nombre, actualizar tipo/balance —
    //    el onboarding solo corre una vez, antes de que haya movimientos)
    for (const acc of accounts) {
      const name    = acc.name.trim();
      const type    = (acc.type ?? "CASH").toUpperCase();
      const balance = Number(acc.balance ?? 0);

      await sql`
        INSERT INTO accounts (org_id, created_by, name, type, balance, is_active)
        VALUES (${orgId}, ${userId}, ${name}, ${type}, ${balance}, TRUE)
        ON CONFLICT (org_id, name) DO UPDATE
          SET type = EXCLUDED.type, balance = EXCLUDED.balance, is_active = TRUE
      `;
    }

    // 2. Guardar moneda + industria en la org (currency es lo que lee
    //    /api/auth/me y la app; industry_id queda NULL si no se
    //    seleccionó — se puede completar después en /settings/organization).
    await sql`
      UPDATE organizations
      SET currency    = ${currency},
          industry_id = COALESCE(${industryId}, industry_id),
          updated_at  = CURRENT_TIMESTAMP
      WHERE id = ${orgId}
    `;

    // 3. Marcar onboarding completo (al final: si algo falló antes,
    //    el usuario puede reintentar desde el onboarding)
    await sql`
      UPDATE user_profile
      SET
        currency             = ${currency},
        onboarding_completed = TRUE,
        updated_at           = CURRENT_TIMESTAMP
      WHERE user_id = ${userId}
    `;

    // Actualizar la cookie de sesión que cachea el proxy (mismo formato
    // que hikonta_session en proxy.ts) para que la navegación al dashboard
    // no repita el fetch de sesión.
    const res = NextResponse.json(
      { message: "Onboarding completado", data: { currency, industry_id: industryId } },
      { status: 201 }
    );
    res.cookies.set(
      "hikonta_session",
      `1|${auth.data.subscription.planSlug ?? ""}|${auth.data.firebaseUid}`,
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
        secure: process.env.NODE_ENV === "production",
      }
    );
    return res;
  } catch (error) {
    console.error(" POST /api/onboarding:", error);
    return createErrorResponse("Error al completar onboarding", 500);
  }
}