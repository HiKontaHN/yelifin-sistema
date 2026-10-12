// app/api/purchases/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import { INVENTORY_PURCHASE_CATEGORY } from "@/lib/seed-default-categories";
import { withTransaction } from "@/lib/db-transaction";
import { recalculatePurchaseItems } from "@/lib/purchase-edit";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

class PurchaseStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseStateConflictError";
  }
}

// ── GET /api/purchases/[id] — detalle de una compra (cabecera + items) ─
// Si la compra pertenece a una importación de Excel (import_batch_id no
// nulo), agrupa TODAS las compras de esa misma ejecución de importación
// (una por fila) y devuelve sus items juntos, como un solo lote.
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canView', 'INCOMING');
  if (deny) return deny;

  try {
    const { orgId }   = auth.data;
    const { id }       = await params;
    const purchaseId   = Number(id);
    const exactBatch   = new URL(request.url).searchParams.get("edit") === "true";

    if (isNaN(purchaseId)) return createErrorResponse("ID inválido", 400);

    const [requested] = await sql`
      SELECT id, import_batch_id FROM purchase_batches
      WHERE id = ${purchaseId} AND org_id = ${orgId}
    `;
    if (!requested) return createErrorResponse("Compra no encontrada", 404);

    const groupRows = requested.import_batch_id && !exactBatch
      ? await sql`
          SELECT id FROM purchase_batches
          WHERE org_id = ${orgId} AND import_batch_id = ${requested.import_batch_id}
        `
      : [{ id: purchaseId }];
    const groupIds = groupRows.map((r: any) => r.id);

    const [summary] = await sql`
      SELECT
        COUNT(DISTINCT pb.id)::int AS batches_count,
        CASE WHEN COUNT(DISTINCT pb.public_id)           = 1 THEN MAX(pb.public_id::text) ELSE NULL END AS public_id,
        CASE WHEN COUNT(DISTINCT pb.account_id)          = 1 THEN MAX(pb.account_id) ELSE NULL END AS account_id,
        CASE WHEN COUNT(DISTINCT pb.account_id)          = 1 THEN MAX(a.name)  ELSE NULL END AS account_name,
        CASE WHEN COUNT(DISTINCT pb.shipping_account_id) = 1 THEN MAX(pb.shipping_account_id) ELSE NULL END AS shipping_account_id,
        CASE WHEN COUNT(DISTINCT pb.shipping_account_id) = 1 THEN MAX(sa.name) ELSE NULL END AS shipping_account_name,
        CASE WHEN COUNT(DISTINCT pb.status)              = 1 THEN MAX(pb.status) ELSE NULL END AS status,
        CASE WHEN COUNT(DISTINCT pb.exchange_rate)       = 1 THEN MAX(pb.exchange_rate) ELSE NULL END AS exchange_rate,
        CASE WHEN COUNT(DISTINCT pb.is_paid)             = 1 THEN BOOL_AND(pb.is_paid) ELSE NULL END AS is_paid,
        CASE WHEN COUNT(DISTINCT pb.warehouse_id)        = 1 THEN MAX(pb.warehouse_id) ELSE NULL END AS warehouse_id,
        MIN(pb.purchased_at) AS purchased_at,
        MAX(pb.notes)        AS notes,
        MAX(pb.currency)     AS currency,
        SUM(pb.subtotal)     AS subtotal,
        SUM(pb.shipping)     AS shipping,
        SUM(pb.total)        AS total
      FROM purchase_batches pb
      LEFT JOIN accounts a  ON a.id  = pb.account_id
      LEFT JOIN accounts sa ON sa.id = pb.shipping_account_id
      WHERE pb.id = ANY(${groupIds}) AND pb.org_id = ${orgId}
    `;

    const items = await sql`
      SELECT
        pbi.id, pbi.product_id, pbi.variant_id,
        p.name AS product_name, pv.variant_name,
        pbi.quantity, pbi.unit_cost, pbi.unit_cost_usd, pbi.total_cost,
        ib.id AS inventory_batch_id,
        GREATEST(0, COALESCE(ib.qty_in, pbi.quantity) - COALESCE(ib.qty_available, pbi.quantity))::int AS consumed_quantity
      FROM purchase_batch_items pbi
      JOIN products p ON p.id = pbi.product_id
      LEFT JOIN product_variants pv ON pv.id = pbi.variant_id
      LEFT JOIN inventory_batches ib
        ON ib.purchase_batch_item_id = pbi.id
        AND ib.org_id = ${orgId}
      WHERE pbi.purchase_batch_id = ANY(${groupIds})
        AND pbi.org_id = ${orgId}
      ORDER BY pbi.id
    `;

    const payload = {
      data: {
        id:             purchaseId,
        is_group:       groupIds.length > 1,
        ...summary,
        items,
      },
    };

    // Mismo patrón de ocultamiento de costos que GET /api/purchases
    const perms = await getModulePermissions(auth.data, 'INVENTORY', 'INCOMING');
    if (!perms.showCosts) {
      nullifyKeysDeep(payload, new Set([
        "subtotal", "shipping", "total", "unit_cost", "unit_cost_usd",
      ]));
    }

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/purchases/[id]:", error);
    return createErrorResponse("Error al obtener la compra", 500);
  }
}

// ── PATCH /api/purchases/[id] — confirmar llegada de inventario ────────
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit', 'INCOMING');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const purchaseId = Number(id);

    if (isNaN(purchaseId)) return createErrorResponse("ID inválido", 400);

    const body = await request.json();
    const action = body.action ?? "confirm";

    if (action === "edit") {
      const itemId = Number(body.item_id);
      const quantity = Number(body.quantity);
      const unitCostProvided = body.unit_cost !== undefined;
      const unitCostInCurrency = unitCostProvided ? Number(body.unit_cost) : null;
      if (!Number.isInteger(itemId) || itemId <= 0)
        return createErrorResponse("Item de compra inválido", 400);
      if (!Number.isInteger(quantity) || quantity <= 0)
        return createErrorResponse("La cantidad debe ser un entero mayor que cero", 400);
      if (
        unitCostProvided &&
        (body.unit_cost === null || !Number.isFinite(unitCostInCurrency) || Number(unitCostInCurrency) < 0)
      )
        return createErrorResponse("El costo unitario no es válido", 400);

      const purchasedAt = body.purchased_at
        ? new Date(body.purchased_at)
        : null;
      if (purchasedAt && Number.isNaN(purchasedAt.getTime()))
        return createErrorResponse("La fecha de compra no es válida", 400);

      try {
        return await withTransaction(async (tx) => {
          const [purchase] = await tx`
            SELECT * FROM purchase_batches
            WHERE id = ${purchaseId} AND org_id = ${orgId}
            FOR UPDATE
          `;
          if (!purchase)
            throw new PurchaseStateConflictError("Compra no encontrada");
          if (purchase.status !== "COMPLETED")
            throw new PurchaseStateConflictError(
              "Solo se pueden corregir ingresos que ya entraron al inventario",
            );

          const [expectedItems] = await tx`
            SELECT COUNT(*)::int AS count
            FROM purchase_batch_items
            WHERE purchase_batch_id = ${purchaseId} AND org_id = ${orgId}
          `;
          const items = await tx`
            SELECT
              pbi.id, pbi.product_id, pbi.variant_id, pbi.quantity,
              pbi.unit_cost_usd, pbi.unit_cost, pbi.total_cost,
              p.name AS product_name,
              ib.id AS inventory_batch_id, ib.qty_in, ib.qty_available
            FROM purchase_batch_items pbi
            JOIN products p
              ON p.id = pbi.product_id AND p.org_id = ${orgId}
            JOIN inventory_batches ib
              ON ib.purchase_batch_item_id = pbi.id AND ib.org_id = ${orgId}
            WHERE pbi.purchase_batch_id = ${purchaseId}
              AND pbi.org_id = ${orgId}
            ORDER BY pbi.id
            FOR UPDATE OF pbi, ib
          `;
          if (items.length !== Number(expectedItems.count))
            throw new PurchaseStateConflictError(
              "La compra no tiene un único lote por producto y no puede corregirse automáticamente",
            );
          const target = items.find((item: any) => Number(item.id) === itemId);
          if (!target)
            throw new PurchaseStateConflictError("El producto no pertenece a esta compra");
          const consumed = Number(target.qty_in) - Number(target.qty_available);
          if (quantity < consumed) {
            throw new PurchaseStateConflictError(
              `No puedes reducir la cantidad por debajo de ${consumed}; esas unidades ya fueron vendidas`,
            );
          }

          const currency = String(purchase.currency ?? "HNL").toUpperCase();
          const rate = currency === "USD" ? Number(purchase.exchange_rate) : 1;
          const shipping = Number(purchase.shipping);
          const recalculated = recalculatePurchaseItems({
            items: items as any[],
            targetItemId: itemId,
            quantity,
            unitCostInCurrency: unitCostProvided
              ? Number(unitCostInCurrency)
              : Number(target.unit_cost_usd),
            currency,
            exchangeRate: rate,
            shipping,
          });
          const nextItems = recalculated.items;
          const { productsLocal, totalInCurrency, totalLocal } = recalculated;
          for (const item of nextItems) {
            item.consumed = Number(item.qty_in) - Number(item.qty_available);
          }
          const nextPurchasedAt = purchasedAt?.toISOString() ?? purchase.purchased_at;
          const nextNotes = body.notes !== undefined
            ? (typeof body.notes === "string" ? body.notes.trim() || null : null)
            : purchase.notes;

          for (const item of nextItems) {
            await tx`
              UPDATE purchase_batch_items
              SET quantity = ${item.next_quantity},
                  unit_cost_usd = ${item.next_base_cost},
                  unit_cost = ${item.next_unit_cost},
                  total_cost = ${item.next_total_cost},
                  updated_by = ${userId}
              WHERE id = ${item.id} AND org_id = ${orgId}
            `;
            await tx`
              UPDATE inventory_batches
              SET qty_in = ${item.next_quantity},
                  qty_available = ${item.next_quantity - item.consumed},
                  unit_cost = ${item.next_unit_cost},
                  received_at = ${nextPurchasedAt},
                  updated_by = ${userId}
              WHERE id = ${item.inventory_batch_id} AND org_id = ${orgId}
            `;
          }

          const quantityDelta = quantity - Number(target.quantity);
          if (quantityDelta !== 0) {
            await tx`
              INSERT INTO inventory_movements (
                org_id, created_by, movement_type, product_id, variant_id,
                quantity, reference_type, reference_id, notes, warehouse_id
              ) VALUES (
                ${orgId}, ${userId}, ${quantityDelta > 0 ? "IN" : "OUT"},
                ${target.product_id}, ${target.variant_id}, ${Math.abs(quantityDelta)},
                'PURCHASE_EDITED', ${purchaseId},
                ${`Corrección de ingreso: ${target.product_name}`}, ${purchase.warehouse_id}
              )
            `;
          }

          await tx`
            UPDATE purchase_batches
            SET subtotal = ${totalLocal}, total = ${totalLocal},
                purchased_at = ${nextPurchasedAt}, notes = ${nextNotes},
                updated_by = ${userId}
            WHERE id = ${purchaseId} AND org_id = ${orgId}
          `;

          // Corrige el gasto y el saldo de la cuenta, si la compra se pagó
          // desde una cuenta. El envío separado conserva su monto.
          const [purchaseTx] = await tx`
            SELECT id, account_id, amount FROM transactions
            WHERE org_id = ${orgId} AND reference_type = 'PURCHASE'
              AND reference_id = ${purchaseId}
            FOR UPDATE
          `;
          if (purchaseTx) {
            const desiredAmount = purchase.shipping_account_id && shipping > 0
              ? productsLocal
              : totalLocal;
            const oldAmount = Number(purchaseTx.amount);
            await tx`
              UPDATE accounts
              SET balance = balance + ${oldAmount - desiredAmount},
                  updated_by = ${userId}
              WHERE id = ${purchaseTx.account_id} AND org_id = ${orgId}
            `;
            await tx`
              UPDATE transactions
              SET amount = ${desiredAmount}, occurred_at = ${nextPurchasedAt},
                  updated_by = ${userId}
              WHERE id = ${purchaseTx.id} AND org_id = ${orgId}
            `;
          }
          await tx`
            UPDATE transactions
            SET occurred_at = ${nextPurchasedAt}, updated_by = ${userId}
            WHERE org_id = ${orgId} AND reference_type = 'PURCHASE_SHIPPING'
              AND reference_id = ${purchaseId}
          `;

          // Si se pagó con tarjeta, el saldo vive en la moneda original.
          const [cardTx] = await tx`
            SELECT id, credit_card_id, amount, currency
            FROM credit_card_transactions
            WHERE org_id = ${orgId} AND purchase_batch_id = ${purchaseId}
              AND type = 'CHARGE'
            FOR UPDATE
          `;
          if (cardTx) {
            const cardDelta = totalInCurrency - Number(cardTx.amount);
            if (String(cardTx.currency).toUpperCase() === "USD") {
              await tx`
                UPDATE credit_cards
                SET balance_usd = balance_usd + ${cardDelta},
                    updated_at = NOW(), updated_by = ${userId}
                WHERE id = ${cardTx.credit_card_id} AND org_id = ${orgId}
              `;
            } else {
              await tx`
                UPDATE credit_cards
                SET balance = balance + ${cardDelta},
                    updated_at = NOW(), updated_by = ${userId}
                WHERE id = ${cardTx.credit_card_id} AND org_id = ${orgId}
              `;
            }
            await tx`
              UPDATE credit_card_transactions
              SET amount = ${totalInCurrency},
                  amount_local = ${purchase.shipping_account_id && shipping > 0 ? productsLocal : totalLocal},
                  occurred_at = ${nextPurchasedAt}, updated_by = ${userId}
              WHERE id = ${cardTx.id} AND org_id = ${orgId}
            `;
          }

          // Las ventas nuevas guardan qué lote consumieron. Al corregir el
          // costo de un lote, se actualiza su COGS histórico sin tocar stock.
          const [allocationSupport] = await tx`
            SELECT to_regclass('public.sale_item_batch_allocations') IS NOT NULL AS supported
          `;
          if (allocationSupport?.supported) {
            await tx`
              UPDATE sale_item_batch_allocations allocation
              SET unit_cost = batch.unit_cost
              FROM inventory_batches batch
              WHERE allocation.inventory_batch_id = batch.id
                AND allocation.org_id = ${orgId}
                AND batch.purchase_batch_item_id IN (
                  SELECT id FROM purchase_batch_items
                  WHERE purchase_batch_id = ${purchaseId} AND org_id = ${orgId}
                )
                AND allocation.restored_at IS NULL
            `;
            await tx`
              UPDATE sale_items item
              SET unit_cost = costs.weighted_cost, updated_by = ${userId}
              FROM (
                SELECT allocation.sale_item_id,
                       SUM(allocation.quantity * allocation.unit_cost)
                         / NULLIF(SUM(allocation.quantity), 0) AS weighted_cost
                FROM sale_item_batch_allocations allocation
                WHERE allocation.org_id = ${orgId}
                  AND allocation.restored_at IS NULL
                GROUP BY allocation.sale_item_id
              ) costs
              WHERE item.id = costs.sale_item_id AND item.org_id = ${orgId}
                AND EXISTS (
                  SELECT 1
                  FROM sale_item_batch_allocations allocation
                  JOIN inventory_batches batch ON batch.id = allocation.inventory_batch_id
                  WHERE allocation.sale_item_id = item.id
                    AND allocation.restored_at IS NULL
                    AND batch.purchase_batch_item_id IN (
                      SELECT id FROM purchase_batch_items
                      WHERE purchase_batch_id = ${purchaseId} AND org_id = ${orgId}
                    )
                )
            `;
          }

          return Response.json({
            message: "Ingreso actualizado",
            data: {
              id: purchaseId,
              item_id: itemId,
              quantity,
              consumed_quantity: consumed,
            },
          });
        });
      } catch (innerError) {
        if (innerError instanceof PurchaseStateConflictError) {
          return createErrorResponse(innerError.message, 409);
        }
        throw innerError;
      }
    }

    if (action !== "confirm")
      return createErrorResponse("Acción inválida. Usar: confirm | edit", 400);
    const { shipping: newShipping, shipping_account_id: bodyShippingAccId } = body;

    // ── Validar que la compra existe y está PENDING ─────────────────
    const [purchase] = await sql`
      SELECT id, account_id, shipping_account_id, status, shipping, subtotal, total, purchased_at, notes, warehouse_id
      FROM purchase_batches
      WHERE id = ${purchaseId} AND org_id = ${orgId}
    `;

    if (!purchase)
      return createErrorResponse("Compra no encontrada", 404);
    if (purchase.status !== "PENDING")
      return createErrorResponse("Esta compra ya fue registrada en inventario", 409);

    // ── Obtener items con sus costos actuales ───────────────────────
    const items = await sql`
      SELECT id, product_id, variant_id, quantity, unit_cost_usd, unit_cost, total_cost
      FROM purchase_batch_items
      WHERE purchase_batch_id = ${purchaseId} AND org_id = ${orgId}
    `;

    if (items.length === 0)
      return createErrorResponse("La compra no tiene items", 400);

    const oldShipping   = Number(purchase.shipping);
    const shippingFinal = newShipping !== undefined && newShipping !== null
      ? Math.max(0, Number(newShipping))
      : oldShipping;
    const shippingDelta = shippingFinal - oldShipping;
    const occurredAt    = purchase.purchased_at ?? new Date().toISOString();

    const totalUnits = items.reduce((acc: number, i: any) => acc + Number(i.quantity), 0);

    // Recalcular unit_cost si el envío cambió
    const updatedItems = items.map((item: any) => {
      const perUnitDelta  = totalUnits > 0 ? shippingDelta / totalUnits : 0;
      const newUnitCost   = Number(item.unit_cost) + perUnitDelta;
      const newTotalCost  = newUnitCost * Number(item.quantity);
      return {
        ...item,
        unit_cost:  newUnitCost,
        total_cost: newTotalCost,
      };
    });

    const newTotal = Number(purchase.total) + shippingDelta;

    // Cuenta que absorbe el delta de envío: body override > stored > main account
    const shippingAccId = bodyShippingAccId
      ? Number(bodyShippingAccId)
      : purchase.shipping_account_id
        ? Number(purchase.shipping_account_id)
        : null;

    try {
      return await withTransaction(async (tx) => {
      const [lockedPurchase] = await tx`
        SELECT status FROM purchase_batches
        WHERE id = ${purchaseId} AND org_id = ${orgId}
        FOR UPDATE
      `;
      if (!lockedPurchase || lockedPurchase.status !== "PENDING") {
        throw new PurchaseStateConflictError(
          "Esta compra ya fue registrada en inventario",
        );
      }

      // 1. Actualizar costos en items si el envío cambió
      if (shippingDelta !== 0) {
        for (const item of updatedItems) {
          await tx`
            UPDATE purchase_batch_items
            SET unit_cost  = ${item.unit_cost},
                total_cost = ${item.total_cost},
                updated_by = ${userId}
            WHERE id = ${item.id} AND org_id = ${orgId}
          `;
        }

        // Actualizar la compra (shipping y total)
        await tx`
          UPDATE purchase_batches
          SET shipping   = ${shippingFinal},
              subtotal   = ${newTotal},
              total      = ${newTotal},
              updated_by = ${userId}
          WHERE id = ${purchaseId} AND org_id = ${orgId}
        `;

        if (shippingAccId) {
          // El envío tiene cuenta dedicada — buscar tx existente o crearla
          const [existingShippingTx] = await tx`
            SELECT id FROM transactions
            WHERE reference_type = 'PURCHASE_SHIPPING'
              AND reference_id   = ${purchaseId}
              AND org_id         = ${orgId}
          `;
          if (existingShippingTx) {
            await tx`
              UPDATE transactions
              SET amount = amount + ${shippingDelta}, updated_by = ${userId}
              WHERE id = ${existingShippingTx.id} AND org_id = ${orgId}
            `;
            await tx`
              UPDATE accounts
              SET balance = balance - ${shippingDelta}, updated_by = ${userId}
              WHERE id = ${shippingAccId} AND org_id = ${orgId}
            `;
          } else {
            // No existía tx de envío — crearla con el monto final
            await tx`
              INSERT INTO transactions (
                org_id, created_by, account_id, type, amount,
                description, category, reference_type, reference_id, occurred_at
              ) VALUES (
                ${orgId}, ${userId}, ${shippingAccId}, 'EXPENSE', ${shippingFinal},
                'Pago de envío', ${INVENTORY_PURCHASE_CATEGORY}, 'PURCHASE_SHIPPING', ${purchaseId}, ${occurredAt}
              )
            `;
            await tx`
              UPDATE accounts
              SET balance = balance - ${shippingFinal}, updated_by = ${userId}
              WHERE id = ${shippingAccId} AND org_id = ${orgId}
            `;
          }
        } else if (purchase.account_id) {
          // Envío incluido en la transacción principal
          await tx`
            UPDATE transactions
            SET amount = ${newTotal}, updated_by = ${userId}
            WHERE reference_type = 'PURCHASE'
              AND reference_id   = ${purchaseId}
              AND org_id         = ${orgId}
          `;
          await tx`
            UPDATE accounts
            SET balance = balance - ${shippingDelta}, updated_by = ${userId}
            WHERE id = ${purchase.account_id} AND org_id = ${orgId}
          `;
        }
        // Para compras CC sin shipping_account: no ajustamos la CC (edge case)
      } else if (shippingAccId && shippingFinal > 0) {
        // El envío no cambió pero el usuario seleccionó cuenta de envío — asegurar que la tx exista
        const [existingShippingTx] = await tx`
          SELECT id FROM transactions
          WHERE reference_type = 'PURCHASE_SHIPPING'
            AND reference_id   = ${purchaseId}
            AND org_id         = ${orgId}
        `;
        if (!existingShippingTx) {
          await tx`
            INSERT INTO transactions (
              org_id, created_by, account_id, type, amount,
              description, category, reference_type, reference_id, occurred_at
            ) VALUES (
              ${orgId}, ${userId}, ${shippingAccId}, 'EXPENSE', ${shippingFinal},
              'Pago de envío', ${INVENTORY_PURCHASE_CATEGORY}, 'PURCHASE_SHIPPING', ${purchaseId}, ${occurredAt}
            )
          `;
          await tx`
            UPDATE accounts
            SET balance = balance - ${shippingFinal}, updated_by = ${userId}
            WHERE id = ${shippingAccId} AND org_id = ${orgId}
          `;
        }
      }

      // 2. Insertar inventory_batches y movements
      for (const item of updatedItems) {
        await tx`
          INSERT INTO inventory_batches (
            org_id, created_by, product_id, variant_id, purchase_batch_item_id,
            qty_in, qty_available, unit_cost, received_at, warehouse_id
          ) VALUES (
            ${orgId}, ${userId}, ${item.product_id}, ${item.variant_id}, ${item.id},
            ${item.quantity}, ${item.quantity}, ${item.unit_cost}, ${occurredAt}, ${purchase.warehouse_id}
          )
        `;

        await tx`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, notes, warehouse_id
          ) VALUES (
            ${orgId}, ${userId}, 'IN', ${item.product_id}, ${item.variant_id},
            ${item.quantity}, 'PURCHASE', ${purchaseId}, ${purchase.notes ?? null}, ${purchase.warehouse_id}
          )
        `;
      }

      // 3. Marcar como completada
      await tx`
        UPDATE purchase_batches
        SET status = 'COMPLETED', updated_by = ${userId}
        WHERE id = ${purchaseId} AND org_id = ${orgId}
      `;

      return Response.json({
        message: "Inventario registrado exitosamente",
        data: { id: purchaseId, total: newTotal, shipping_adjusted: shippingDelta !== 0 },
      });
      });
    } catch (innerError) {
      if (innerError instanceof PurchaseStateConflictError) {
        return createErrorResponse(innerError.message, 409);
      }
      throw innerError;
    }

  } catch (error) {
    console.error("PATCH /api/purchases/[id]:", error);
    return createErrorResponse("Error al procesar la compra", 500);
  }
}

// ── DELETE /api/purchases/[id] — cancelar compra pendiente ─────────────
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canDelete', 'INCOMING');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }       = await params;
    const purchaseId   = Number(id);

    if (isNaN(purchaseId)) return createErrorResponse("ID inválido", 400);

    const [purchase] = await sql`
      SELECT id, account_id, status, notes, is_paid
      FROM purchase_batches
      WHERE id = ${purchaseId} AND org_id = ${orgId}
    `;

    if (!purchase) return createErrorResponse("Compra no encontrada", 404);
    if (purchase.status !== "PENDING")
      return createErrorResponse("Solo se pueden cancelar compras pendientes de llegada", 409);

    // Las compras pagadas con tarjeta se guardan con account_id = NULL — igual que
    // los pendientes de importación Excel sin fuente de pago, que no tienen cargo
    // que revertir (si el import usó tarjeta, el cargo existe y está vinculado v4.5).
    // is_paid = TRUE marca las que ya estaban pagadas antes de la plataforma
    // (already_paid, ver POST /api/purchases) — nunca tuvieron cargo alguno
    // que buscar, ni de cuenta ni de tarjeta.
    const isImported         = (purchase.notes ?? "").startsWith("Importación Excel");
    const isCreditCardFunded = !purchase.is_paid && purchase.account_id === null;

    // La reversión de cargos a tarjeta depende de credit_card_transactions.purchase_batch_id
    // (migración v4.5). Se verifica antes de abrir la transacción para no ejecutar una
    // columna inexistente dentro de un BEGIN/COMMIT si la migración aún no se aplicó.
    const [ccLinkColumn] = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'credit_card_transactions' AND column_name = 'purchase_batch_id'
    `;
    const hasCcLink = !!ccLinkColumn;

    try {
      return await withTransaction(async (tx) => {
      const [lockedPurchase] = await tx`
        SELECT status FROM purchase_batches
        WHERE id = ${purchaseId} AND org_id = ${orgId}
        FOR UPDATE
      `;
      if (!lockedPurchase || lockedPurchase.status !== "PENDING") {
        throw new PurchaseStateConflictError(
          "Solo se pueden cancelar compras pendientes de llegada",
        );
      }

      // 1. Revertir transacciones de cuenta (compra + envío)
      const txs = await tx`
        SELECT id, account_id, amount FROM transactions
        WHERE org_id = ${orgId}
          AND reference_type IN ('PURCHASE', 'PURCHASE_SHIPPING')
          AND reference_id   = ${purchaseId}
      `;
      for (const transaction of txs) {
        await tx`DELETE FROM transactions WHERE id = ${transaction.id} AND org_id = ${orgId}`;
        await tx`
          UPDATE accounts SET balance = balance + ${transaction.amount}, updated_by = ${userId}
          WHERE id = ${transaction.account_id} AND org_id = ${orgId}
        `;
      }

      // 2. Revertir cargo a tarjeta de crédito, si la compra se pagó así
      let ccReversed = true;
      if (isCreditCardFunded) {
        if (hasCcLink) {
          const [ccTx] = await tx`
            SELECT id, amount, currency, credit_card_id FROM credit_card_transactions
            WHERE org_id             = ${orgId}
              AND purchase_batch_id  = ${purchaseId}
              AND type                = 'CHARGE'
          `;
          if (ccTx) {
            await tx`DELETE FROM credit_card_transactions WHERE id = ${ccTx.id} AND org_id = ${orgId}`;
            if (ccTx.currency === "USD") {
              await tx`
                UPDATE credit_cards SET balance_usd = balance_usd - ${ccTx.amount}, updated_at = NOW(), updated_by = ${userId}
                WHERE id = ${ccTx.credit_card_id} AND org_id = ${orgId}
              `;
            } else {
              await tx`
                UPDATE credit_cards SET balance = balance - ${ccTx.amount}, updated_at = NOW(), updated_by = ${userId}
                WHERE id = ${ccTx.credit_card_id} AND org_id = ${orgId}
              `;
            }
          } else {
            // Sin cargo vinculado: en imports sin fuente de pago no hay nada
            // que revertir — solo advertir en compras de tarjeta reales.
            ccReversed = isImported;
          }
        } else {
          ccReversed = false;
        }
      }

      // 3. Eliminar la compra y sus items (no hay inventario que revertir: PENDING nunca lo generó)
      await tx`DELETE FROM purchase_batch_items WHERE purchase_batch_id = ${purchaseId} AND org_id = ${orgId}`;
      await tx`DELETE FROM purchase_batches     WHERE id = ${purchaseId} AND org_id = ${orgId}`;

      return Response.json({
        message: ccReversed
          ? "Compra cancelada y transacciones revertidas"
          : "Compra cancelada. No se encontró el cargo de tarjeta para revertir automáticamente; ajústalo manualmente.",
        data: { id: purchaseId, cc_reversed: ccReversed },
      });
      });
    } catch (innerError) {
      if (innerError instanceof PurchaseStateConflictError) {
        return createErrorResponse(innerError.message, 409);
      }
      throw innerError;
    }

  } catch (error) {
    console.error("DELETE /api/purchases/[id]:", error);
    return createErrorResponse("Error al cancelar la compra", 500);
  }
}
