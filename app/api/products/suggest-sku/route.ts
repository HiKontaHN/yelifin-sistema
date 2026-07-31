// app/api/products/suggest-sku/route.ts
// GET ?name=X [&count=N] → próximos SKUs de producto disponibles (prefijo por iniciales)
// GET ?check=X           → disponibilidad del SKU X
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { nextProductSkus, isProductSkuAvailable, skuPrefixFromName } from "@/lib/sku";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canView');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);

    const check = searchParams.get("check")?.trim();
    if (check) {
      const available = await isProductSkuAvailable(sql, orgId, check);
      return Response.json({ data: { available } });
    }

    const name = searchParams.get("name")?.trim();
    if (!name) return createErrorResponse("El nombre es requerido", 400);

    const count = Math.min(10, Math.max(1, Number(searchParams.get("count")) || 1));
    const prefix = skuPrefixFromName(name);
    const suggestions = await nextProductSkus(sql, orgId, prefix, count);

    return Response.json({ data: { prefix, suggestions } });
  } catch (error) {
    console.error("GET /api/products/suggest-sku:", error);
    return createErrorResponse("Error al sugerir SKU", 500);
  }
}
