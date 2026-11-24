import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";

import { createErrorResponse, isAuthSuccess, verifyAuth } from "@/lib/auth";
import {
  normalizeSocialLink, SOCIAL_LABELS, SOCIAL_PLATFORMS,
  type OrganizationSocialLinks, type SocialPlatform,
} from "@/lib/organization-social-links";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  if (!auth.data.isOwner) return createErrorResponse("Solo el dueño puede administrar las redes sociales", 403);

  try {
    const rows = await sql`
      SELECT platform, url
      FROM organization_social_links
      WHERE org_id = ${auth.data.orgId}
    `;
    const links: OrganizationSocialLinks = { facebook: null, instagram: null, whatsapp: null };
    for (const row of rows) {
      links[row.platform as SocialPlatform] = String(row.url);
    }
    return Response.json({ data: links });
  } catch {
    console.error("GET /api/organization/social-links: no se pudieron consultar las redes");
    return createErrorResponse("No se pudieron cargar las redes sociales", 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  if (!auth.data.isOwner) return createErrorResponse("Solo el dueño puede administrar las redes sociales", 403);

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return createErrorResponse("Debes indicar las redes sociales", 400);
  }

  const input = body as Partial<Record<SocialPlatform, unknown>>;
  const links: OrganizationSocialLinks = { facebook: null, instagram: null, whatsapp: null };
  for (const platform of SOCIAL_PLATFORMS) {
    const value = input[platform];
    if (value === null || (typeof value === "string" && !value.trim())) continue;
    const url = typeof value === "string" ? normalizeSocialLink(platform, value) : null;
    if (!url) {
      const hint = platform === "whatsapp" ? " o un número con + y código de país" : "";
      return createErrorResponse(`Ingresa un enlace válido de ${SOCIAL_LABELS[platform]}${hint}`, 400);
    }
    links[platform] = url;
  }

  const { orgId } = auth.data;
  try {
    await sql.transaction([
      // Serializa los cambios de un mismo negocio para guardar la selección completa.
      sql`SELECT id FROM organizations WHERE id = ${orgId} FOR NO KEY UPDATE`,
      sql`
        WITH incoming(platform, url) AS (
          VALUES ('facebook', ${links.facebook}::text),
                 ('instagram', ${links.instagram}::text),
                 ('whatsapp', ${links.whatsapp}::text)
        ), removed AS (
          DELETE FROM organization_social_links AS saved
          USING incoming
          WHERE saved.org_id = ${orgId}
            AND saved.platform = incoming.platform
            AND incoming.url IS NULL
        )
        INSERT INTO organization_social_links (org_id, platform, url)
        SELECT ${orgId}, platform, url
        FROM incoming
        WHERE url IS NOT NULL
        ON CONFLICT (org_id, platform) DO UPDATE SET url = EXCLUDED.url
      `,
    ]);
    return Response.json({ data: links });
  } catch {
    console.error("PUT /api/organization/social-links: no se pudieron guardar las redes");
    return createErrorResponse("No se pudieron guardar las redes sociales", 500);
  }
}
