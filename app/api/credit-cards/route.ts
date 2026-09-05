// app/api/credit-cards/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canView', 'CREDIT_CARDS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;

    const cards = await sql`
      SELECT
        id, public_id, name, last_four, credit_limit,
        statement_closing_day, payment_due_day,
        balance, balance_usd, is_active, created_at, updated_at
      FROM credit_cards
      WHERE org_id = ${orgId} AND is_active = TRUE
      ORDER BY name ASC
    `;

    return Response.json({ data: cards, total: cards.length });
  } catch (error) {
    console.error("GET /api/credit-cards:", error);
    return createErrorResponse("Error al obtener tarjetas de crédito", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit', 'CREDIT_CARDS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const {
      name,
      last_four,
      credit_limit,
      statement_closing_day,
      payment_due_day,
      initial_balance,
      initial_balance_usd,
    } = await request.json();

    if (!name?.trim()) return createErrorResponse("El nombre es requerido", 400);

    if (statement_closing_day !== undefined && (statement_closing_day < 1 || statement_closing_day > 31))
      return createErrorResponse("Día de corte inválido (1-31)", 400);

    if (payment_due_day !== undefined && (payment_due_day < 1 || payment_due_day > 31))
      return createErrorResponse("Día de pago inválido (1-31)", 400);

    const [card] = await sql`
      INSERT INTO credit_cards (
        org_id, created_by, name, last_four, credit_limit,
        statement_closing_day, payment_due_day,
        balance, balance_usd
      ) VALUES (
        ${orgId},
        ${userId},
        ${name.trim()},
        ${last_four ?? null},
        ${credit_limit ? Number(credit_limit) : null},
        ${statement_closing_day ?? null},
        ${payment_due_day ?? null},
        ${initial_balance ? Number(initial_balance) : 0},
        ${initial_balance_usd ? Number(initial_balance_usd) : 0}
      )
      RETURNING *
    `;

    return Response.json({ data: card }, { status: 201 });
  } catch (error: any) {
    if (error.code === "23505")
      return createErrorResponse("Ya existe una tarjeta con ese nombre", 409);
    console.error("POST /api/credit-cards:", error);
    return createErrorResponse("Error al crear tarjeta de crédito", 500);
  }
}
