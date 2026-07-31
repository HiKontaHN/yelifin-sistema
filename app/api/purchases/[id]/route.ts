// app/api/purchases/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

// ── PATCH /api/purchases/[id] — confirmar llegada de inventario ────────
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const purchaseId = Number(id);

    if (isNaN(purchaseId)) return createErrorResponse("ID inválido", 400);

    const body = await request.json();
    const { shipping: newShipping, shipping_account_id: bodyShippingAccId } = body;

    // ── Validar que la compra existe y está PENDING ─────────────────
    const [purchase] = await sql`
      SELECT id, account_id, shipping_account_id, status, shipping, subtotal, total, purchased_at, notes
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

    await sql`BEGIN`;
    try {
      // 1. Actualizar costos en items si el envío cambió
      if (shippingDelta !== 0) {
        for (const item of updatedItems) {
          await sql`
            UPDATE purchase_batch_items
            SET unit_cost  = ${item.unit_cost},
                total_cost = ${item.total_cost}
            WHERE id = ${item.id} AND org_id = ${orgId}
          `;
        }

        // Actualizar la compra (shipping y total)
        await sql`
          UPDATE purchase_batches
          SET shipping = ${shippingFinal},
              subtotal = ${newTotal},
              total    = ${newTotal}
          WHERE id = ${purchaseId} AND org_id = ${orgId}
        `;

        if (shippingAccId) {
          // El envío tiene cuenta dedicada — buscar tx existente o crearla
          const [existingShippingTx] = await sql`
            SELECT id FROM transactions
            WHERE reference_type = 'PURCHASE_SHIPPING'
              AND reference_id   = ${purchaseId}
              AND org_id         = ${orgId}
          `;
          if (existingShippingTx) {
            await sql`
              UPDATE transactions
              SET amount = amount + ${shippingDelta}
              WHERE id = ${existingShippingTx.id}
            `;
            await sql`
              UPDATE accounts
              SET balance = balance - ${shippingDelta}
              WHERE id = ${shippingAccId} AND org_id = ${orgId}
            `;
          } else {
            // No existía tx de envío — crearla con el monto final
            await sql`
              INSERT INTO transactions (
                org_id, created_by, account_id, type, amount,
                description, reference_type, reference_id, occurred_at
              ) VALUES (
                ${orgId}, ${userId}, ${shippingAccId}, 'EXPENSE', ${shippingFinal},
                'Pago de envío', 'PURCHASE_SHIPPING', ${purchaseId}, ${occurredAt}
              )
            `;
            await sql`
              UPDATE accounts
              SET balance = balance - ${shippingFinal}
              WHERE id = ${shippingAccId} AND org_id = ${orgId}
            `;
          }
        } else if (purchase.account_id) {
          // Envío incluido en la transacción principal
          await sql`
            UPDATE transactions
            SET amount = ${newTotal}
            WHERE reference_type = 'PURCHASE'
              AND reference_id   = ${purchaseId}
              AND org_id         = ${orgId}
          `;
          await sql`
            UPDATE accounts
            SET balance = balance - ${shippingDelta}
            WHERE id = ${purchase.account_id} AND org_id = ${orgId}
          `;
        }
        // Para compras CC sin shipping_account: no ajustamos la CC (edge case)
      } else if (shippingAccId && shippingFinal > 0) {
        // El envío no cambió pero el usuario seleccionó cuenta de envío — asegurar que la tx exista
        const [existingShippingTx] = await sql`
          SELECT id FROM transactions
          WHERE reference_type = 'PURCHASE_SHIPPING'
            AND reference_id   = ${purchaseId}
            AND org_id         = ${orgId}
        `;
        if (!existingShippingTx) {
          await sql`
            INSERT INTO transactions (
              org_id, created_by, account_id, type, amount,
              description, reference_type, reference_id, occurred_at
            ) VALUES (
              ${orgId}, ${userId}, ${shippingAccId}, 'EXPENSE', ${shippingFinal},
              'Pago de envío', 'PURCHASE_SHIPPING', ${purchaseId}, ${occurredAt}
            )
          `;
          await sql`
            UPDATE accounts
            SET balance = balance - ${shippingFinal}
            WHERE id = ${shippingAccId} AND org_id = ${orgId}
          `;
        }
      }

      // 2. Insertar inventory_batches y movements
      for (const item of updatedItems) {
        await sql`
          INSERT INTO inventory_batches (
            org_id, created_by, product_id, variant_id, purchase_batch_item_id,
            qty_in, qty_available, unit_cost, received_at
          ) VALUES (
            ${orgId}, ${userId}, ${item.product_id}, ${item.variant_id}, ${item.id},
            ${item.quantity}, ${item.quantity}, ${item.unit_cost}, ${occurredAt}
          )
        `;

        await sql`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, notes
          ) VALUES (
            ${orgId}, ${userId}, 'IN', ${item.product_id}, ${item.variant_id},
            ${item.quantity}, 'PURCHASE', ${purchaseId}, ${purchase.notes ?? null}
          )
        `;
      }

      // 3. Marcar como completada
      await sql`
        UPDATE purchase_batches
        SET status = 'COMPLETED'
        WHERE id = ${purchaseId} AND org_id = ${orgId}
      `;

      await sql`COMMIT`;

      return Response.json({
        message: "Inventario registrado exitosamente",
        data: { id: purchaseId, total: newTotal, shipping_adjusted: shippingDelta !== 0 },
      });

    } catch (innerError) {
      await sql`ROLLBACK`;
      throw innerError;
    }

  } catch (error) {
    console.error("PATCH /api/purchases/[id]:", error);
    return createErrorResponse("Error al confirmar la llegada", 500);
  }
}

// ── DELETE /api/purchases/[id] — cancelar compra pendiente ─────────────
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canDelete');
  if (deny) return deny;

  try {
    const { orgId }   = auth.data;
    const { id }       = await params;
    const purchaseId   = Number(id);

    if (isNaN(purchaseId)) return createErrorResponse("ID inválido", 400);

    const [purchase] = await sql`
      SELECT id, account_id, status, notes
      FROM purchase_batches
      WHERE id = ${purchaseId} AND org_id = ${orgId}
    `;

    if (!purchase) return createErrorResponse("Compra no encontrada", 404);
    if (purchase.status !== "PENDING")
      return createErrorResponse("Solo se pueden cancelar compras pendientes de llegada", 409);

    // Las compras pagadas con tarjeta se guardan con account_id = NULL — igual que
    // los pendientes de importación Excel sin fuente de pago, que no tienen cargo
    // que revertir (si el import usó tarjeta, el cargo existe y está vinculado v4.5).
    const isImported         = (purchase.notes ?? "").startsWith("Importación Excel");
    const isCreditCardFunded = purchase.account_id === null;

    // La reversión de cargos a tarjeta depende de credit_card_transactions.purchase_batch_id
    // (migración v4.5). Se verifica antes de abrir la transacción para no ejecutar una
    // columna inexistente dentro de un BEGIN/COMMIT si la migración aún no se aplicó.
    const [ccLinkColumn] = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'credit_card_transactions' AND column_name = 'purchase_batch_id'
    `;
    const hasCcLink = !!ccLinkColumn;

    await sql`BEGIN`;
    try {
      // 1. Revertir transacciones de cuenta (compra + envío)
      const txs = await sql`
        SELECT id, account_id, amount FROM transactions
        WHERE org_id = ${orgId}
          AND reference_type IN ('PURCHASE', 'PURCHASE_SHIPPING')
          AND reference_id   = ${purchaseId}
      `;
      for (const tx of txs) {
        await sql`DELETE FROM transactions WHERE id = ${tx.id} AND org_id = ${orgId}`;
        await sql`
          UPDATE accounts SET balance = balance + ${tx.amount}
          WHERE id = ${tx.account_id} AND org_id = ${orgId}
        `;
      }

      // 2. Revertir cargo a tarjeta de crédito, si la compra se pagó así
      let ccReversed = true;
      if (isCreditCardFunded) {
        if (hasCcLink) {
          const [ccTx] = await sql`
            SELECT id, amount, currency, credit_card_id FROM credit_card_transactions
            WHERE org_id             = ${orgId}
              AND purchase_batch_id  = ${purchaseId}
              AND type                = 'CHARGE'
          `;
          if (ccTx) {
            await sql`DELETE FROM credit_card_transactions WHERE id = ${ccTx.id} AND org_id = ${orgId}`;
            if (ccTx.currency === "USD") {
              await sql`
                UPDATE credit_cards SET balance_usd = balance_usd - ${ccTx.amount}, updated_at = NOW()
                WHERE id = ${ccTx.credit_card_id} AND org_id = ${orgId}
              `;
            } else {
              await sql`
                UPDATE credit_cards SET balance = balance - ${ccTx.amount}, updated_at = NOW()
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
      await sql`DELETE FROM purchase_batch_items WHERE purchase_batch_id = ${purchaseId} AND org_id = ${orgId}`;
      await sql`DELETE FROM purchase_batches     WHERE id = ${purchaseId} AND org_id = ${orgId}`;

      await sql`COMMIT`;

      return Response.json({
        message: ccReversed
          ? "Compra cancelada y transacciones revertidas"
          : "Compra cancelada. No se encontró el cargo de tarjeta para revertir automáticamente; ajústalo manualmente.",
        data: { id: purchaseId, cc_reversed: ccReversed },
      });

    } catch (innerError) {
      await sql`ROLLBACK`;
      throw innerError;
    }

  } catch (error) {
    console.error("DELETE /api/purchases/[id]:", error);
    return createErrorResponse("Error al cancelar la compra", 500);
  }
}
