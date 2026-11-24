import { neon, NeonDbError } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";

import { createErrorResponse, isAuthSuccess, requireFeature, requireModule, verifyAuthAndSubscription } from "@/lib/auth";
import { isProductCategoryReferenceError, productCategoryId, productCategoryName } from "@/lib/product-categories";

const sql = neon(process.env.DATABASE_URL!);
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuthAndSubscription(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const feature = await requireFeature(auth.data.orgId, "inventory.view");
  if (feature) return feature;
  const deny = await requireModule(auth.data, "ADMIN", "canEdit", "CATEGORIES");
  if (deny) return deny;

  const id = productCategoryId.safeParse(Number((await params).id));
  if (!id.success) return createErrorResponse("Categoría inválida", 400);
  const body = await request.json().catch(() => null);
  const name = productCategoryName.safeParse(body?.name);
  if (!name.success) return createErrorResponse("Ingresa un nombre de 1 a 100 caracteres", 400);

  try {
    const [category] = await sql`
      UPDATE product_categories SET name = ${name.data}
      WHERE org_id = ${auth.data.orgId} AND id = ${id.data}
      RETURNING id, name
    `;
    if (!category) return createErrorResponse("Categoría no encontrada", 404);
    return Response.json({ data: category });
  } catch (error) {
    if (error instanceof NeonDbError && error.code === "23505") {
      return createErrorResponse("Ya existe una categoría con ese nombre", 409);
    }
    console.error("PATCH /api/product-categories/[id]:", error);
    return createErrorResponse("No se pudo actualizar la categoría", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuthAndSubscription(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const feature = await requireFeature(auth.data.orgId, "inventory.view");
  if (feature) return feature;
  const deny = await requireModule(auth.data, "ADMIN", "canDelete", "CATEGORIES");
  if (deny) return deny;

  const id = productCategoryId.safeParse(Number((await params).id));
  if (!id.success) return createErrorResponse("Categoría inválida", 400);

  try {
    const [category] = await sql`
      DELETE FROM product_categories
      WHERE org_id = ${auth.data.orgId} AND id = ${id.data}
      RETURNING id
    `;
    if (!category) return createErrorResponse("Categoría no encontrada", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (isProductCategoryReferenceError(error)) {
      return createErrorResponse("Quita esta categoría de los productos que la usan antes de eliminarla", 409);
    }
    console.error("DELETE /api/product-categories/[id]:", error);
    return createErrorResponse("No se pudo eliminar la categoría", 500);
  }
}
