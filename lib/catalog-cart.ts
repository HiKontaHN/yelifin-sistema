import { isCatalogId, type CatalogStock } from "@/lib/catalog-stock";
import { normalizeSocialLink } from "@/lib/organization-social-links";
import type { PublicCatalogItem } from "@/lib/public-catalog";

export type CatalogCart = Record<string, number>;

export type CatalogCartLine = {
  id: string;
  name: string;
  variantName?: string;
  isService: boolean;
  quantity: number;
  price: number;
  available: number | null | undefined;
};

export function readCatalogCart(raw: string | null): CatalogCart {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, quantity]) =>
      isCatalogId(id) && Number.isSafeInteger(quantity) && quantity > 0,
    ));
  } catch {
    return {};
  }
}

export function changeCatalogQuantity(cart: CatalogCart, id: string, quantity: number, available: number | null | undefined) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) return cart;
  const previous = cart[id] ?? 0;
  if (quantity === previous) return cart;
  if (quantity > previous && (available === undefined || (available !== null && quantity > available))) return cart;
  const updated = { ...cart };
  if (quantity === 0) delete updated[id];
  else updated[id] = quantity;
  return updated;
}

export function buildCatalogCartLines(items: PublicCatalogItem[], cart: CatalogCart, stock: CatalogStock): CatalogCartLine[] {
  const lines: CatalogCartLine[] = [];
  for (const item of items) {
    if (cart[item.id]) {
      lines.push({
        id: item.id,
        name: item.name,
        variantName: item.variants.length > 0 ? "Presentación base" : undefined,
        isService: item.is_service,
        quantity: cart[item.id],
        price: item.price,
        available: stock[item.id],
      });
    }
    for (const variant of item.variants) {
      if (cart[variant.id]) {
        lines.push({
          id: variant.id,
          name: item.name,
          variantName: variant.variant_name || "Opción",
          isService: item.is_service,
          quantity: cart[variant.id],
          price: variant.price,
          available: stock[item.id] !== undefined ? stock[variant.id] : undefined,
        });
      }
    }
  }
  return lines;
}

export function canShareCatalogCart(lines: CatalogCartLine[]) {
  return lines.length > 0 && lines.every(({ available, quantity }) =>
    available === null || (available !== undefined && available >= quantity),
  );
}

export function buildCatalogMessage(lines: CatalogCartLine[]) {
  const hasServices = lines.some((line) => line.isService);
  const hasProducts = lines.some((line) => !line.isService);
  const kind = hasServices ? (hasProducts ? "productos y servicios" : "servicios") : "productos";
  const list = lines.map(({ quantity, name, variantName }) => {
    const label = variantName ? `${name} (${variantName})` : name;
    return `• ${quantity} × ${label.replace(/\s+/g, " ").trim()}`;
  });
  return [`Hola, vengo de tu catálogo de HiKonta. Me interesan estos ${kind}:`, "", ...list, "", "¿Me pueden confirmar la disponibilidad?"].join("\n");
}

export function getWhatsAppCatalogShare(link: string | null, message: string) {
  const normalized = normalizeSocialLink("whatsapp", link ?? "");
  if (!normalized) return null;
  const contact = new URL(normalized);
  const number = contact.hostname === "api.whatsapp.com"
    ? contact.searchParams.get("phone")
    : contact.pathname.match(/^\/([1-9]\d{7,14})\/?$/)?.[1];
  if (!number) {
    contact.searchParams.delete("text");
    return { url: contact.href, copy: true };
  }

  const url = new URL(`https://wa.me/${number}`);
  url.search = `?text=${encodeURIComponent(message)}`;
  // Conserva el texto completo en el portapapeles si no cabe en un enlace práctico.
  if (url.href.length > 6000) {
    url.searchParams.delete("text");
    return { url: url.href, copy: true };
  }
  return { url: url.href, copy: false };
}

export const INSTAGRAM_WEB_INBOX = "https://www.instagram.com/direct/inbox/";

export function getInstagramCatalogChat(link: string | null) {
  const normalized = normalizeSocialLink("instagram", link ?? "");
  if (!normalized) return null;
  const contact = new URL(normalized);
  const profilePath = contact.hostname === "ig.me" ? contact.pathname.slice(2) : contact.pathname;
  const handle = profilePath.match(/^\/([a-z0-9._]{1,30})\/?$/i)?.[1];
  if (!handle || /^(accounts|direct|explore|p|reel|reels|stories)$/i.test(handle)) {
    return { url: INSTAGRAM_WEB_INBOX, handle: null };
  }
  return { url: `https://ig.me/m/${handle}`, handle };
}
