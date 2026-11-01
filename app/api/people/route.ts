import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "customers.manage";
const ROLES = ["CLIENT", "SUPPLIER", "THIRD_PARTY", "CONTACT"] as const;

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "CUSTOMERS", "canView");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;
  const role = request.nextUrl.searchParams.get("role")?.toUpperCase() || null;
  const search = request.nextUrl.searchParams.get("search")?.trim() || null;
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 10));
  const offset = (page - 1) * limit;
  if (role && !ROLES.includes(role as any)) return createErrorResponse("Rol inválido", 400);
  try {
    const [{ count }] = await sql`
      SELECT COUNT(DISTINCT p.id)::int AS count
      FROM people p
      LEFT JOIN person_roles pr ON pr.person_id = p.id
      WHERE p.org_id = ${auth.data.orgId} AND p.is_active = TRUE
        AND (${role}::text IS NULL OR EXISTS (SELECT 1 FROM person_roles r WHERE r.person_id = p.id AND r.role = ${role}))
        AND (${search}::text IS NULL OR p.name ILIKE ${"%" + (search ?? "") + "%"} OR p.email ILIKE ${"%" + (search ?? "") + "%"} OR p.phone ILIKE ${"%" + (search ?? "") + "%"})
    `;
    const data = await sql`
      SELECT p.*, c.total_orders, c.total_spent,
        COALESCE(array_agg(pr.role ORDER BY pr.role) FILTER (WHERE pr.role IS NOT NULL), '{}') AS roles
      FROM people p
      LEFT JOIN person_roles pr ON pr.person_id = p.id
      LEFT JOIN customers c ON c.person_id = p.id OR c.id = p.source_customer_id
      WHERE p.org_id = ${auth.data.orgId} AND p.is_active = TRUE
        AND (${role}::text IS NULL OR EXISTS (SELECT 1 FROM person_roles r WHERE r.person_id = p.id AND r.role = ${role}))
        AND (${search}::text IS NULL OR p.name ILIKE ${"%" + (search ?? "") + "%"} OR p.email ILIKE ${"%" + (search ?? "") + "%"} OR p.phone ILIKE ${"%" + (search ?? "") + "%"})
      GROUP BY p.id, c.total_orders, c.total_spent
      ORDER BY p.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return Response.json({ data, total: Number(count), page, limit, totalPages: Math.max(1, Math.ceil(Number(count) / limit)) });
  } catch (error) {
    console.error("GET /api/people:", error);
    return createErrorResponse("Error al obtener personas", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "CUSTOMERS", "canEdit");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "THIRD_PARTY").toUpperCase();
    if (!name) return createErrorResponse("El nombre es requerido", 400);
    if (!ROLES.includes(role as any)) return createErrorResponse("Rol inválido", 400);
    const totalOrders = Math.max(0, Math.trunc(Number(body.total_orders ?? 0)));
    const totalSpent = Math.max(0, Number(body.total_spent ?? 0));
    if (!Number.isFinite(totalOrders) || !Number.isFinite(totalSpent)) return createErrorResponse("Los valores históricos son inválidos", 400);
    const result = await withTransaction(async (tx) => {
      let customerId: number | null = null;
      if (role === "CLIENT") {
        const [customer] = await tx`
          INSERT INTO customers (org_id, created_by, name, phone, email, notes, total_orders, total_spent)
          VALUES (${auth.data.orgId}, ${auth.data.userId}, ${name}, ${body.phone ?? null}, ${body.email ?? null}, ${body.notes ?? null}, ${totalOrders}, ${totalSpent})
          RETURNING id
        `;
        customerId = Number(customer.id);
      }
      const [person] = await tx`
        INSERT INTO people (org_id, name, tax_id, email, phone, address, notes, source_customer_id, created_by)
        VALUES (${auth.data.orgId}, ${name}, ${body.tax_id ?? null}, ${body.email ?? null}, ${body.phone ?? null}, ${body.address ?? null}, ${body.notes ?? null}, ${customerId}, ${auth.data.userId})
        RETURNING *
      `;
      await tx`INSERT INTO person_roles (person_id, role, is_primary) VALUES (${person.id}, ${role}, TRUE)`;
      if (customerId) await tx`UPDATE customers SET person_id = ${person.id} WHERE id = ${customerId} AND org_id = ${auth.data.orgId}`;
      return { ...person, id: Number(person.id), roles: [role], total_orders: totalOrders, total_spent: totalSpent };
    });
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/people:", error);
    return createErrorResponse("Error al registrar la persona", 500);
  }
}
