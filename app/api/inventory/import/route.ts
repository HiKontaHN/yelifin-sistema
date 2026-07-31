// app/api/inventory/import/route.ts
// Import masivo por Excel: productos + inventario (listo / pendiente de llegar),
// con compra individual por fila cuando la fila trae cuenta.
// ?dry_run=true valida y devuelve preview sin escribir.
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  verifyAuth,
  createErrorResponse,
  isAuthSuccess,
  requireModule,
  requireFeature,
  verifyResourceLimit,
} from "@/lib/auth";
import {
  parseWorkbook,
  validateRows,
  resolveRows,
  summarizeRows,
  type ResolvedRow,
} from "@/lib/import-inventory";

const sql = neon(process.env.DATABASE_URL!);

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

type RowResult = {
  rowNumber: number;
  sku: string | null;
  productName: string | null;
  action: string;
  status: "ok" | "failed";
  error?: string;
  purchaseId?: number;
};

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "INVENTORY", "canEdit");
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, "products.bulk_import");
  if (denyFeature) return denyFeature;

  try {
    const { userId, orgId } = auth.data;
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry_run") === "true";

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return createErrorResponse("No se recibió ningún archivo", 400);
    if (file.size > MAX_FILE_BYTES)
      return createErrorResponse("El archivo no puede superar 5 MB", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, error: parseError } = parseWorkbook(buffer);
    if (parseError) return createErrorResponse(parseError, 400);

    validateRows(rows);
    const resolved = await resolveRows(rows, orgId, sql);

    // ── Dry run: preview del archivo completo, sin escribir ───────────
    if (dryRun) {
      const summary = summarizeRows(resolved);
      const limitError = await checkPlanLimits(orgId, summary);
      if (limitError) return limitError;

      return Response.json({
        data: {
          rows: resolved.map((r) => ({
            rowNumber: r.rowNumber,
            sku: r.sku,
            nombre: r.nombre,
            productName: r.productName,
            cantidad: r.cantidad,
            costoUnitario: r.costoUnitario,
            fecha: r.fecha,
            estado: r.estado,
            account: r.account,
            action: r.action,
            errors: r.errors,
            warnings: r.warnings,
          })),
          summary,
        },
      });
    }

    // ── Ejecución por lotes: el cliente pide un rango [offset, offset+limit)
    // de filas ya resueltas para mantener cada request muy por debajo del
    // timeout de la función serverless (la escritura es secuencial, fila por
    // fila, con varios round-trips SQL cada una — no es paralelizable con el
    // driver HTTP de Neon, que no soporta transacciones reales entre queries).
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) || resolved.length : resolved.length;
    const chunk = resolved.slice(offset, offset + limit);
    if (chunk.length === 0)
      return createErrorResponse("No hay filas para procesar en ese rango", 400);

    const chunkSummary = summarizeRows(chunk);
    const limitError = await checkPlanLimits(orgId, chunkSummary);
    if (limitError) return limitError;

    const results: RowResult[] = [];
    for (const row of chunk) {
      if (row.action === "error") {
        results.push(rowResult(row, "failed", row.errors.join("; ")));
        continue;
      }
      if (row.action === "omitir") {
        results.push(rowResult(row, "ok"));
        continue;
      }
      try {
        const purchaseId = await executeRow(row, orgId, userId);
        results.push({ ...rowResult(row, "ok"), ...(purchaseId ? { purchaseId } : {}) });
      } catch (rowError) {
        console.error(`Import fila ${row.rowNumber}:`, rowError);
        results.push(rowResult(row, "failed", "Error al procesar la fila — reintentala"));
      }
    }

    const failed = results.filter((r) => r.status === "failed").length;
    const nextOffset = offset + chunk.length < resolved.length ? offset + chunk.length : null;
    return Response.json(
      {
        message:
          failed === 0
            ? "Importación completada"
            : `Importación completada con ${failed} fila(s) fallida(s)`,
        data: { results, summary: chunkSummary, nextOffset, totalRows: resolved.length },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/inventory/import:", error);
    return createErrorResponse("Error al procesar la importación", 500);
  }
}

// Valida límites del plan (productos, transacciones) contra un resumen —
// se usa tanto para el preview completo como para cada lote de ejecución.
async function checkPlanLimits(orgId: number, summary: ReturnType<typeof summarizeRows>): Promise<Response | null> {
  if (summary.newProducts > 0) {
    const limit = await verifyResourceLimit(orgId, "products");
    if (!limit.withinLimit) {
      return createErrorResponse(
        limit.error ?? "Límite de productos alcanzado",
        limit.status,
        "needsUpgrade" in limit ? !!limit.needsUpgrade : false
      );
    }
    const [plan] = await sql`
      SELECT sp.max_products,
        (SELECT COUNT(*) FROM products p WHERE p.org_id = ${orgId} AND p.is_active = TRUE)::int AS current_count
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE os.org_id = ${orgId}
    `;
    if (
      plan &&
      plan.max_products !== null &&
      Number(plan.current_count ?? 0) + summary.newProducts > Number(plan.max_products)
    ) {
      return createErrorResponse(
        `El archivo crea ${summary.newProducts} productos y tu plan solo permite ${Number(plan.max_products) - Number(plan.current_count)} más`,
        403,
        true
      );
    }
  }

  if (summary.purchasesWithPayment > 0) {
    const [plan] = await sql`
      SELECT sp.max_transactions_per_month,
        (SELECT COUNT(*) FROM transactions t
         WHERE t.org_id = ${orgId}
           AND DATE_TRUNC('month', t.occurred_at) = DATE_TRUNC('month', NOW()))::int AS current_count
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE os.org_id = ${orgId}
    `;
    if (
      plan &&
      plan.max_transactions_per_month !== null &&
      Number(plan.current_count ?? 0) + summary.purchasesWithPayment >
        Number(plan.max_transactions_per_month)
    ) {
      return createErrorResponse(
        "El archivo crearía más transacciones de las que permite tu plan este mes",
        403,
        true
      );
    }
  }

  return null;
}

function rowResult(row: ResolvedRow, status: "ok" | "failed", error?: string): RowResult {
  return {
    rowNumber: row.rowNumber,
    sku: row.sku,
    productName: row.productName ?? row.nombre,
    action: row.action,
    status,
    ...(error ? { error } : {}),
  };
}

// Ejecuta una fila según la matriz de acciones. Devuelve el id de la compra
// creada (si la fila generó una). Cada fila es autocontenida: el driver HTTP
// de Neon no tiene transacciones reales, así que una fila fallida no deja
// compras a medias de otras filas.
async function executeRow(
  row: ResolvedRow,
  orgId: number,
  userId: number
): Promise<number | null> {
  let productId = row.productId;

  // 1. Crear producto si no existe
  if (productId === null) {
    const finalSku =
      row.sku ??
      `PRD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const [product] = await sql`
      INSERT INTO products (org_id, created_by, name, description, sku, barcode, price, image_url, is_service)
      VALUES (
        ${orgId}, ${userId}, ${row.nombre!.trim()}, ${row.descripcion},
        ${finalSku}, ${null}, ${row.precio}, ${null}, ${false}
      )
      RETURNING id
    `;
    productId = Number(product.id);
  }

  // Fila sin cantidad: solo crear el producto
  if (row.cantidad === null) return null;

  const quantity = row.cantidad;
  const unitCost = row.costoUnitario ?? 0;
  const totalCost = unitCost * quantity;
  const occurredAt = row.fecha ?? new Date().toISOString();
  const isPending = row.estado === "pendiente";
  const hasPayment = row.account !== null;
  const isCreditCard = row.account?.kind === "credit_card";
  const label = row.productName ?? row.nombre ?? "producto";
  const txDescription = `Compra — ${label}${row.sku ? ` (${row.sku})` : ""}`;

  let purchaseId: number | null = null;

  // 2. Compra individual (con cuenta, o pendiente sin fuente de pago)
  if (hasPayment || isPending) {
    const [batch] = await sql`
      INSERT INTO purchase_batches (
        org_id, created_by, account_id, shipping_account_id, currency, exchange_rate,
        subtotal, shipping, tax, total, is_paid, purchased_at, notes, status
      ) VALUES (
        ${orgId}, ${userId},
        ${hasPayment && !isCreditCard ? row.account!.id : null}, ${null},
        ${"HNL"}, ${1},
        ${totalCost}, ${0}, ${0}, ${totalCost},
        ${false}, ${occurredAt}, ${"Importación Excel"}, ${isPending ? "PENDING" : "COMPLETED"}
      )
      RETURNING id
    `;
    purchaseId = Number(batch.id);

    const [batchItem] = await sql`
      INSERT INTO purchase_batch_items (
        org_id, created_by, purchase_batch_id, product_id, variant_id,
        quantity, unit_cost_usd, unit_cost, total_cost
      ) VALUES (
        ${orgId}, ${userId}, ${purchaseId}, ${productId}, ${row.variantId},
        ${quantity}, ${unitCost}, ${unitCost}, ${totalCost}
      )
      RETURNING id
    `;

    // 3. Movimiento financiero (solo si la fila trae cuenta)
    if (hasPayment && isCreditCard) {
      await sql`
        INSERT INTO credit_card_transactions (
          org_id, created_by, credit_card_id, type, description,
          amount, currency, exchange_rate, amount_local,
          purchase_batch_id, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, ${row.account!.id}, 'CHARGE', ${txDescription},
          ${totalCost}, ${"HNL"}, ${null}, ${totalCost},
          ${purchaseId}, ${occurredAt}
        )
      `;
      await sql`
        UPDATE credit_cards SET balance = balance + ${totalCost}, updated_at = NOW()
        WHERE id = ${row.account!.id} AND org_id = ${orgId}
      `;
    } else if (hasPayment) {
      await sql`
        INSERT INTO transactions (
          org_id, created_by, account_id, type, amount,
          description, reference_type, reference_id, occurred_at
        ) VALUES (
          ${orgId}, ${userId}, ${row.account!.id}, 'EXPENSE', ${totalCost},
          ${txDescription}, 'PURCHASE', ${purchaseId}, ${occurredAt}
        )
      `;
      await sql`
        UPDATE accounts SET balance = balance - ${totalCost}
        WHERE id = ${row.account!.id} AND org_id = ${orgId}
      `;
    }

    // 4. Inventario inmediato solo si está listo (pendiente lo genera el PATCH al llegar)
    if (!isPending) {
      await sql`
        INSERT INTO inventory_batches (
          org_id, created_by, product_id, variant_id, purchase_batch_item_id,
          qty_in, qty_available, unit_cost, received_at
        ) VALUES (
          ${orgId}, ${userId}, ${productId}, ${row.variantId}, ${batchItem.id},
          ${quantity}, ${quantity}, ${unitCost}, ${occurredAt}
        )
      `;
      await sql`
        INSERT INTO inventory_movements (
          org_id, created_by, movement_type, product_id, variant_id,
          quantity, reference_type, reference_id, notes
        ) VALUES (
          ${orgId}, ${userId}, 'IN', ${productId}, ${row.variantId},
          ${quantity}, 'PURCHASE', ${purchaseId}, ${"Importación Excel"}
        )
      `;
    }
  } else {
    // Sin cuenta y listo: inventario inicial, sin compra ni finanzas
    await sql`
      INSERT INTO inventory_batches (
        org_id, created_by, product_id, variant_id, purchase_batch_item_id,
        qty_in, qty_available, unit_cost, received_at
      ) VALUES (
        ${orgId}, ${userId}, ${productId}, ${row.variantId}, ${null},
        ${quantity}, ${quantity}, ${unitCost}, ${occurredAt}
      )
    `;
    await sql`
      INSERT INTO inventory_movements (
        org_id, created_by, movement_type, product_id, variant_id,
        quantity, reference_type, reference_id, notes
      ) VALUES (
        ${orgId}, ${userId}, 'IN', ${productId}, ${row.variantId},
        ${quantity}, 'INITIAL', ${null}, ${"Importación Excel"}
      )
    `;
  }

  return purchaseId;
}
