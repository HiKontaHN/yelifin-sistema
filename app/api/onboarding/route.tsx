import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  verifyAuth,
  createErrorResponse,
  isAuthSuccess,
  verifyResourceLimit,
} from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";
import { FREE_PLAN_MAX_ACCOUNTS } from "@/lib/plan-limits";

const sql = neon(process.env.DATABASE_URL!);

class OnboardingAlreadyCompletedError extends Error {}

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
  if (!auth.data.isOwner)
    return createErrorResponse("Solo el dueño puede completar el onboarding", 403);

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

    // Límite temporal del plan Gratis (ver lib/plan-limits.ts) — espejo del
    // límite del cliente en app/(auth)/onboarding/page.tsx, para que no se
    // pueda saltar deshabilitando JS.
    if (accounts.length > FREE_PLAN_MAX_ACCOUNTS)
      return createErrorResponse(`El plan Gratis incluye hasta ${FREE_PLAN_MAX_ACCOUNTS} cuentas`, 400);

    // Validar cuentas
    const validTypes = ["CASH", "BANK", "WALLET", "OTHER"];
    for (const acc of accounts) {
      if (!acc.name?.trim())
        return createErrorResponse("El nombre de la cuenta es requerido", 400);
      if (!validTypes.includes((acc.type ?? "").toUpperCase()))
        return createErrorResponse(`Tipo de cuenta inválido: ${acc.type}`, 400);
    }

    const limit = await verifyResourceLimit(orgId, "accounts");
    if (!limit.withinLimit) {
      return createErrorResponse(
        limit.error ?? "Límite alcanzado",
        limit.status,
        "needsUpgrade" in limit ? !!limit.needsUpgrade : false,
      );
    }

    await withTransaction(async (tx) => {
      const [profile] = await tx`
        SELECT onboarding_completed
        FROM user_profile
        WHERE user_id = ${userId}
        FOR UPDATE
      `;
      if (profile?.onboarding_completed) {
        throw new OnboardingAlreadyCompletedError();
      }

      for (const acc of accounts) {
        const name    = acc.name.trim();
        const type    = (acc.type ?? "CASH").toUpperCase();
        const balance = Number(acc.balance ?? 0);

        await tx`
          INSERT INTO accounts (org_id, created_by, name, type, balance, is_active)
          VALUES (${orgId}, ${userId}, ${name}, ${type}, ${balance}, TRUE)
          ON CONFLICT (org_id, name) DO NOTHING
        `;
      }

      await tx`
        UPDATE organizations
        SET currency    = ${currency},
            industry_id = COALESCE(${industryId}, industry_id),
            updated_at  = CURRENT_TIMESTAMP
        WHERE id = ${orgId}
      `;

      await tx`
        UPDATE user_profile
        SET
          currency             = ${currency},
          onboarding_completed = TRUE,
          updated_at           = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}
      `;
    });

    // Actualizar la cookie de sesión que cachea el proxy (mismo formato
    // que hikonta_nav en proxy.ts) para que la navegación al dashboard
    // no repita el fetch de sesión.
    const res = NextResponse.json(
      { message: "Onboarding completado", data: { currency, industry_id: industryId } },
      { status: 201 }
    );
    res.cookies.set(
      "hikonta_nav",
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
    if (error instanceof OnboardingAlreadyCompletedError) {
      return createErrorResponse("El onboarding ya fue completado", 409);
    }
    console.error(" POST /api/onboarding:", error);
    return createErrorResponse("Error al completar onboarding", 500);
  }
}
