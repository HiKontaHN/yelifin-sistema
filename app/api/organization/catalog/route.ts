import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createErrorResponse, isAuthSuccess, verifyAuth } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);

function catalogData(catalogPublicId: unknown, catalogPublicSlug: unknown) {
  const catalogId = catalogPublicId ? String(catalogPublicId) : null;
  return {
    catalog_id: catalogId,
    catalog_path: catalogId ? `/catalog/${catalogPublicSlug ?? catalogId}` : null,
  };
}

class InvalidCatalogSelectionError extends Error {}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  if (!auth.data.isOwner) return createErrorResponse("Solo el dueño puede administrar el catálogo", 403);

  try {
    const [organization] = await sql`
      SELECT catalog_public_id, catalog_public_slug
      FROM organizations
      WHERE id = ${auth.data.orgId}
    `;

    if (!organization) return createErrorResponse("Organización no encontrada", 404);
    const products = await sql`
      SELECT
        p.id,
        p.name,
        p.description,
        p.sku,
        p.is_service,
        EXISTS (
          SELECT 1
          FROM organization_catalog_items catalog_item
          WHERE catalog_item.org_id = p.org_id
            AND catalog_item.product_id = p.id
        ) AS selected
      FROM products p
      WHERE p.org_id = ${auth.data.orgId}
        AND p.is_active = TRUE
      ORDER BY p.is_service, p.name
    `;

    return Response.json({
      data: {
        ...catalogData(organization.catalog_public_id, organization.catalog_public_slug),
        products: products.map((product) => ({
          id: Number(product.id),
          name: String(product.name),
          description: product.description ? String(product.description) : null,
          sku: product.sku ? String(product.sku) : null,
          is_service: Boolean(product.is_service),
          selected: Boolean(product.selected),
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/organization/catalog:", error);
    return createErrorResponse("Error al obtener el catálogo", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  if (!auth.data.isOwner) return createErrorResponse("Solo el dueño puede administrar el catálogo", 403);

  try {
    const body = await request.json().catch(() => ({}));
    const regenerate = body.regenerate === true;
    if (!Array.isArray(body.product_ids)) {
      return createErrorResponse("Debes indicar los productos y servicios del catálogo", 400);
    }
    const productIds: number[] = [
      ...new Set<number>((body.product_ids as unknown[]).map((value) => Number(value))),
    ];
    if (productIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return createErrorResponse("La selección contiene productos inválidos", 400);
    }

    const organization = await withTransaction(async (tx) => {
      const [updatedOrganization] = await tx`
        UPDATE organizations
        SET
          catalog_public_id = CASE
            WHEN ${regenerate} OR catalog_public_id IS NULL THEN gen_random_uuid()
            ELSE catalog_public_id
          END,
          updated_at = NOW()
        WHERE id = ${auth.data.orgId}
        RETURNING catalog_public_id, catalog_public_slug
      `;
      if (!updatedOrganization) return null;

      await tx`
        DELETE FROM organization_catalog_items
        WHERE org_id = ${auth.data.orgId}
      `;

      if (productIds.length > 0) {
        const inserted = await tx`
          INSERT INTO organization_catalog_items (org_id, product_id)
          SELECT ${auth.data.orgId}, p.id
          FROM products p
          WHERE p.org_id = ${auth.data.orgId}
            AND p.is_active = TRUE
            AND p.id = ANY(${productIds})
          RETURNING product_id
        `;
        if (inserted.length !== productIds.length) {
          throw new InvalidCatalogSelectionError("Uno o más productos no pertenecen al negocio");
        }
      }

      return updatedOrganization;
    });

    if (!organization) return createErrorResponse("Organización no encontrada", 404);
    return Response.json({
      data: catalogData(organization.catalog_public_id, organization.catalog_public_slug),
    });
  } catch (error) {
    if (error instanceof InvalidCatalogSelectionError) {
      return createErrorResponse(error.message, 400);
    }
    console.error("POST /api/organization/catalog:", error);
    return createErrorResponse("Error al generar el catálogo", 500);
  }
}
