import { isCatalogId } from "@/lib/catalog-stock";

export function parsePublicCatalogLink(value: string) {
  const normalized = value.toLowerCase();
  if (isCatalogId(normalized)) return { id: normalized, slug: null };
  if (normalized.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) return null;
  return { id: null, slug: normalized };
}
