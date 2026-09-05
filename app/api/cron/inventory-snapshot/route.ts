// app/api/cron/inventory-snapshot/route.ts
//
// Cron diario (ver vercel.json) que guarda una foto del stock/valor de
// inventario por organización, en inventory_snapshots (v4.18). Sin este
// historial no se puede calcular rotación de inventario ni días de
// inventario en el reporte — ver database/migrations/v4.18-inventory-snapshots.sql.
//
// Solo corre para orgs en un plan de pago elegible (SNAPSHOT_ELIGIBLE_PLAN_SLUGS)
// — no para Gratis/Plus, para no gastar cómputo en el grueso de cuentas
// gratuitas.
//
// Apagado de emergencia: poner INVENTORY_SNAPSHOT_ENABLED=false en las
// variables de entorno del proyecto en Vercel (Settings → Environment
// Variables) y redeploy. El cron sigue disparando en el horario
// configurado, pero el handler retorna de inmediato sin tocar la base
// de datos ni consumir cómputo. Quitar la variable (o ponerla en
// cualquier otro valor) para reactivarlo.
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Vercel Cron por defecto corre en Hobby con precisión de ±59 min —
// 60s es el máximo de duración permitido en ese plan; de sobra para un
// loop secuencial y liviano sobre las orgs elegibles.
export const maxDuration = 60;

const SNAPSHOT_ELIGIBLE_PLAN_SLUGS = ["pro", "admin", "original"];

export async function GET(request: NextRequest) {
  // Vercel agrega este header automáticamente en cada invocación de cron
  // cuando CRON_SECRET está configurado — rechaza cualquier otra llamada.
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  // Interruptor de apagado — ver comentario de archivo.
  if (process.env.INVENTORY_SNAPSHOT_ENABLED === "false") {
    return Response.json({ ok: true, skipped: true, reason: "INVENTORY_SNAPSHOT_ENABLED=false" });
  }

  try {
    const orgs = await sql`
      SELECT os.org_id
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE sp.slug = ANY(${SNAPSHOT_ELIGIBLE_PLAN_SLUGS})
    `;

    // Secuencial a propósito: mantiene la carga sobre Neon acotada y
    // predecible en vez de disparar hasta 100 queries concurrentes.
    let processed = 0;
    for (const { org_id } of orgs) {
      const [agg] = await sql`
        SELECT
          COALESCE(SUM(ib.qty_available), 0)::int                 AS total_stock,
          COALESCE(SUM(ib.qty_available * ib.unit_cost), 0)::float AS total_stock_value
        FROM products p
        LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.org_id = p.org_id
        WHERE p.org_id    = ${org_id}
          AND p.is_active  = TRUE
          AND p.is_service = FALSE
      `;

      await sql`
        INSERT INTO inventory_snapshots (org_id, snapshot_date, total_stock, total_stock_value)
        VALUES (${org_id}, CURRENT_DATE, ${agg.total_stock}, ${agg.total_stock_value})
        ON CONFLICT (org_id, snapshot_date)
        DO UPDATE SET total_stock = EXCLUDED.total_stock, total_stock_value = EXCLUDED.total_stock_value
      `;
      processed++;
    }

    return Response.json({ ok: true, orgs_processed: processed });
  } catch (error) {
    console.error("GET /api/cron/inventory-snapshot:", error);
    return Response.json({ error: "Error al generar snapshots de inventario" }, { status: 500 });
  }
}
