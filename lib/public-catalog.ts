import { cache } from "react";
import { neon } from "@neondatabase/serverless";

import { isCatalogId, type CatalogStock } from "@/lib/catalog-stock";
import { normalizeSocialLink, type OrganizationSocialLinks } from "@/lib/organization-social-links";
import { readPublicCatalogStock } from "@/lib/public-catalog-stock";

export { isCatalogId } from "@/lib/catalog-stock";

export type PublicCatalogVariant = {
  id: string;
  variant_name: string | null;
  price: number;
  image_url: string | null;
};

export type PublicCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_service: boolean;
  variants: PublicCatalogVariant[];
};

export type PublicCatalog = {
  organization: {
    name: string;
    logo_url: string | null;
    currency: string;
    locale: string;
  };
  items: PublicCatalogItem[];
  stock: CatalogStock;
  contacts: Pick<OrganizationSocialLinks, "instagram" | "whatsapp">;
};

export const getPublicCatalog = cache(async (catalogId: string): Promise<PublicCatalog | null> => {
  if (!isCatalogId(catalogId)) return null;

  const sql = neon(process.env.DATABASE_URL!);
  const [organization] = await sql`
    SELECT o.name, o.logo_url, o.currency, o.locale,
           instagram.url AS instagram, whatsapp.url AS whatsapp
    FROM organizations o
    LEFT JOIN organization_social_links instagram ON instagram.org_id = o.id AND instagram.platform = 'instagram'
    LEFT JOIN organization_social_links whatsapp ON whatsapp.org_id = o.id AND whatsapp.platform = 'whatsapp'
    WHERE o.catalog_public_id = ${catalogId}::uuid
      AND o.is_active = TRUE
  `;

  if (!organization) return null;

  const [products, stock] = await Promise.all([sql`
    SELECT
      p.catalog_item_id AS id,
      p.name,
      p.description,
      p.price,
      p.image_url,
      p.is_service,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', pv.catalog_item_id,
              'variant_name', pv.variant_name,
              'price', COALESCE(pv.price_override, p.price),
              'image_url', pv.image_url
            )
            ORDER BY pv.variant_name NULLS LAST, pv.id
          )
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND pv.org_id = p.org_id
            AND pv.is_active = TRUE
        ),
        '[]'::jsonb
      ) AS variants
    FROM organizations o
    JOIN organization_catalog_items catalog_item ON catalog_item.org_id = o.id
    JOIN products p ON p.id = catalog_item.product_id AND p.org_id = o.id
    WHERE o.catalog_public_id = ${catalogId}::uuid
      AND o.is_active = TRUE AND p.is_active = TRUE
    ORDER BY p.is_service, p.name
  `, readPublicCatalogStock(catalogId)]);
  if (!stock) return null;

  return {
    organization: {
      name: String(organization.name),
      logo_url: organization.logo_url ? String(organization.logo_url) : null,
      currency: String(organization.currency ?? "HNL"),
      locale: String(organization.locale ?? "es-HN"),
    },
    contacts: {
      instagram: normalizeSocialLink("instagram", String(organization.instagram ?? "")),
      whatsapp: normalizeSocialLink("whatsapp", String(organization.whatsapp ?? "")),
    },
    stock,
    items: products.map((product) => ({
      id: String(product.id),
      name: String(product.name),
      description: product.description ? String(product.description) : null,
      price: Number(product.price),
      image_url: product.image_url ? String(product.image_url) : null,
      is_service: Boolean(product.is_service),
      variants: Array.isArray(product.variants)
        ? product.variants.map((variant: Record<string, unknown>) => ({
            id: String(variant.id),
            variant_name: variant.variant_name ? String(variant.variant_name) : null,
            price: Number(variant.price),
            image_url: variant.image_url ? String(variant.image_url) : null,
          }))
        : [],
    })),
  };
});
