// app/api/transaction-categories/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

const VALID_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
type TransactionType = (typeof VALID_TYPES)[number];

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canView', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const type   = searchParams.get("type");
    const search = searchParams.get("search")?.trim() || null;
    // status por defecto "active" — igual que el comportamiento de siempre,
    // para no romper a los consumidores que solo piden categorías para
    // llenar un <Select> (create/edit-transaction-modal, pay-credit-card-dialog).
    const status = searchParams.get("status") ?? "active";
    // page ausente = sin paginar, se devuelven todas las que matcheen (mismo
    // comportamiento de siempre) — solo pagina si el caller lo pide
    // explícitamente (la página de /settings/categories).
    const pageParam = searchParams.get("page");
    const page  = pageParam ? Math.max(1, Number(pageParam) || 1) : null;
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

    if (type && !VALID_TYPES.includes(type as TransactionType)) {
      return createErrorResponse(
        "Tipo inválido. Debe ser INCOME, EXPENSE o TRANSFER",
        400
      );
    }
    if (!["active", "inactive", "all"].includes(status)) {
      return createErrorResponse("Estado inválido. Debe ser active, inactive o all", 400);
    }

    const isActiveFilter = status === "all" ? null : status === "active";

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM transaction_categories
      WHERE org_id  = ${orgId}
        AND (${type}::text IS NULL OR type = ${type})
        AND (${isActiveFilter}::boolean IS NULL OR is_active = ${isActiveFilter})
        AND (${search}::text IS NULL OR name ILIKE '%' || ${search} || '%')
    `;

    const categories = await sql`
      SELECT id, name, type, is_active, created_at
      FROM transaction_categories
      WHERE org_id  = ${orgId}
        AND (${type}::text IS NULL OR type = ${type})
        AND (${isActiveFilter}::boolean IS NULL OR is_active = ${isActiveFilter})
        AND (${search}::text IS NULL OR name ILIKE '%' || ${search} || '%')
      ORDER BY type, name
      ${page ? sql`LIMIT ${limit} OFFSET ${(page - 1) * limit}` : sql``}
    `;

    return Response.json({
      data: categories,
      total: count,
      totalPages: page ? Math.ceil(count / limit) : 1,
    });
  } catch (error) {
    console.error("GET /api/transaction-categories:", error);
    return createErrorResponse("Error al obtener categorías", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const body = await request.json();
    const { name, type } = body;

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return createErrorResponse("El nombre es requerido", 400);
    }

    if (!type) {
      return createErrorResponse("El tipo es requerido", 400);
    }

    if (!VALID_TYPES.includes(type as TransactionType)) {
      return createErrorResponse(
        "Tipo inválido. Debe ser INCOME, EXPENSE o TRANSFER",
        400
      );
    }

    const [category] = await sql`
      INSERT INTO transaction_categories (org_id, created_by, name, type)
      VALUES (${orgId}, ${userId}, ${name.trim()}, ${type})
      RETURNING *
    `;

    return Response.json({ data: category }, { status: 201 });
  } catch (error: any) {
    if (error.code === "23505") {
      return createErrorResponse(
        "Ya existe una categoría con ese nombre para este tipo",
        409
      );
    }
    console.error("POST /api/transaction-categories:", error);
    return createErrorResponse("Error al crear categoría", 500);
  }
}