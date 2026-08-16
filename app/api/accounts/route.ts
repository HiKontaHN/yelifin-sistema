// app/api/accounts/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  verifyAuth, createErrorResponse, isAuthSuccess, requireModule, verifyResourceLimit,
  verifyAnyModuleAccess, getModulePermissions, nullifyKeysDeep,
  type OrgModule,
} from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

// Módulos que necesitan poder seleccionar una cuenta al registrar algo
// (venta, compra de inventario, gasto de evento) aunque el rol no tenga
// acceso al módulo FINANZAS.
const ACCOUNT_SELECTOR_MODULES: OrgModule[] = ["FINANCES", "SALES", "INVENTORY", "PRODUCTS", "EVENTS"];

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  const canList = await verifyAnyModuleAccess(auth.data, ACCOUNT_SELECTOR_MODULES, "canView");
  if (!canList) return createErrorResponse("Sin acceso a este módulo", 403);

  try {
    const { orgId } = auth.data;

    const accounts = await sql`
      SELECT id, name, type, balance, is_active, created_at
      FROM accounts
      WHERE org_id = ${orgId} AND is_active = TRUE
      ORDER BY name ASC
    `;

    // El saldo es información financiera: solo se expone si el rol tiene
    // acceso a FINANZAS. Roles de SALES/INVENTORY/EVENTS igual reciben la
    // cuenta (id/nombre/tipo) para poder seleccionarla en sus formularios.
    const finances = await getModulePermissions(auth.data, "FINANCES");
    const payload = finances.canView ? accounts : nullifyKeysDeep(accounts, new Set(["balance"]));

    return Response.json({ data: payload, total: payload.length });

  } catch (error) {
    console.error(" GET /api/accounts:", error);
    return createErrorResponse("Error al obtener cuentas", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit');
  if (deny) return deny;

  const limit = await verifyResourceLimit(auth.data.orgId, "accounts");
  if (!limit.withinLimit) {
    return createErrorResponse(limit.error ?? "Límite alcanzado", limit.status, "needsUpgrade" in limit ? !!limit.needsUpgrade : false);
  }

  try {
    const { userId, orgId } = auth.data;
    const { name, type, balance } = await request.json();

    if (!name) return createErrorResponse("El nombre es requerido", 400);
    if (!type) return createErrorResponse("El tipo es requerido", 400);

    const [account] = await sql`
      INSERT INTO accounts (org_id, name, type, balance, created_by)
      VALUES (${orgId}, ${name}, ${type}, ${Number(balance) || 0}, ${userId})
      RETURNING *
    `;

    return Response.json({ data: account }, { status: 201 });

  } catch (error: any) {
    if (error.code === "23505")
      return createErrorResponse("Ya existe una cuenta con ese nombre", 409);
    console.error(" POST /api/accounts:", error);
    return createErrorResponse("Error al crear cuenta", 500);
  }
}