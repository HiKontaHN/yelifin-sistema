// app/api/products/[id]/variants/suggest-sku/route.ts
// GET ?count=N  → próximos N SKUs de variante disponibles para el producto
// GET ?check=X  → disponibilidad del SKU X
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { nextVariantSkus, isVariantSkuAvailable, variantSkuBase } from "@/lib/sku";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canView');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) return createErrorResponse("ID inválido", 400);

    const { searchParams } = new URL(request.url);
    const check = searchParams.get("check")?.trim();

    if (check) {
      const available = await isVariantSkuAvailable(sql, orgId, check);
      return Response.json({ data: { available } });
    }

    const [product] = await sql`
      SELECT id, sku FROM products
      WHERE id = ${productId} AND org_id = ${orgId} AND is_active = TRUE
      LIMIT 1
    `;
    if (!product) return createErrorResponse("Producto no encontrado", 404);

    const count = Math.min(10, Math.max(1, Number(searchParams.get("count")) || 2));
    const base = variantSkuBase(product.sku, productId);
    const suggestions = await nextVariantSkus(sql, orgId, base, count);

    return Response.json({ data: { base, suggestions } });
  } catch (error) {
    console.error("GET /api/products/[id]/variants/suggest-sku:", error);
    return createErrorResponse("Error al sugerir SKU", 500);
  }
}
