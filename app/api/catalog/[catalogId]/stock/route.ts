import { upgradeWebSocket } from "@vercel/functions";
import type { NextRequest } from "next/server";

import { isCatalogId, type CatalogStockEvent } from "@/lib/catalog-stock";
import { attachCatalogStockSocket } from "@/lib/catalog-stock-realtime";
import { findPublicCatalogOrganization, readPublicCatalogStock } from "@/lib/public-catalog-stock";
import { getClientIP, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ catalogId: string }> }) {
  const { catalogId: param } = await params;
  const catalogId = param.toLowerCase();
  if (!isCatalogId(catalogId)) return new Response(null, { status: 404, headers: NO_CACHE });

  try {
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const origin = request.headers.get("origin");
      if (origin && origin !== request.nextUrl.origin) {
        return new Response(null, { status: 403, headers: NO_CACHE });
      }
      const rate = await rateLimit(`catalog-socket:${getClientIP(request)}`, 60, 60_000);
      if (!rate.allowed) {
        return new Response(null, { status: 429, headers: { ...NO_CACHE, "Retry-After": String(rate.retryAfterSec) } });
      }
      const orgId = await findPublicCatalogOrganization(catalogId);
      if (!orgId) return new Response(null, { status: 404, headers: NO_CACHE });
      return await upgradeWebSocket((socket) => attachCatalogStockSocket(socket, catalogId, orgId), { maxPayload: 1024 });
    }

    const stock = await readPublicCatalogStock(catalogId);
    if (!stock) return new Response(null, { status: 404, headers: NO_CACHE });
    return Response.json({ type: "stock", stock } satisfies CatalogStockEvent, { headers: NO_CACHE });
  } catch {
    return new Response(null, { status: 503, headers: NO_CACHE });
  }
}
