import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";

import { createErrorResponse, isAuthSuccess, requireFeature, requireModule, verifyAuthAndSubscription } from "@/lib/auth";
import { productCategoryName } from "@/lib/product-categories";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuthAndSubscription(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const feature = await requireFeature(auth.data.orgId, "inventory.view");
  if (feature) return feature;
  const deny = await requireModule(auth.data, "PRODUCTS", "canView")
    && await requireModule(auth.data, "ADMIN", "canView", "CATEGORIES");
  if (deny) return deny;

  try {
    const categories = await sql`
      SELECT id, name FROM product_categories
      WHERE org_id = ${auth.data.orgId}
      ORDER BY lower(name), id
    `;
    return Response.json({ data: categories });
  } catch (error) {
    console.error("GET /api/product-categories:", error);
    return createErrorResponse("No se pudieron cargar las categorías de productos", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuthAndSubscription(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const feature = await requireFeature(auth.data.orgId, "inventory.view");
  if (feature) return feature;
  const deny = await requireModule(auth.data, "ADMIN", "canEdit", "CATEGORIES");
  if (deny) return deny;

  const body = await request.json().catch(() => null);
  const name = productCategoryName.safeParse(body?.name);
  if (!name.success) return createErrorResponse("Ingresa un nombre de 1 a 100 caracteres", 400);

  try {
    const [category] = await sql`
      INSERT INTO product_categories (org_id, name)
      VALUES (${auth.data.orgId}, ${name.data})
      ON CONFLICT (org_id, lower(name)) DO NOTHING
      RETURNING id, name
    `;
    if (!category) return createErrorResponse("Ya existe una categoría con ese nombre", 409);
    return Response.json({ data: category }, { status: 201 });
  } catch (error) {
    console.error("POST /api/product-categories:", error);
    return createErrorResponse("No se pudo crear la categoría", 500);
  }
}
