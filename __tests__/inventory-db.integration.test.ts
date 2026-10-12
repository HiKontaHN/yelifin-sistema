import {
  consumeFifo,
  recordSaleItemBatchAllocations,
  restoreSaleItemBatchAllocations,
  supportsSaleItemBatchAllocations,
} from "@/lib/fifo";
import { withTransaction } from "@/lib/db-transaction";

const describeDatabase = process.env.RUN_DB_INTEGRATION === "1"
  ? describe
  : describe.skip;

class ExpectedRollback extends Error {}

describeDatabase("inventory FIFO — integración con la base de desarrollo", () => {
  jest.setTimeout(45_000);

  it("acepta movimientos inmutables de corrección de ingreso", async () => {
    const marker = `CODEx-PURCHASE-EDIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await withTransaction(async (tx) => {
        const [scope] = await tx<{ org_id: number; warehouse_id: number }>`
          SELECT w.org_id, w.id AS warehouse_id
          FROM warehouses w
          JOIN organizations o ON o.id = w.org_id
          WHERE w.is_active = TRUE AND o.is_active = TRUE
          ORDER BY w.is_default DESC, w.id
          LIMIT 1
        `;
        expect(scope).toBeDefined();

        const [product] = await tx<{ id: number }>`
          INSERT INTO products (org_id, name, sku, price, is_active, is_service)
          VALUES (${scope.org_id}, ${marker}, ${marker}, 30, TRUE, FALSE)
          RETURNING id
        `;
        const [movement] = await tx<{ reference_type: string }>`
          INSERT INTO inventory_movements (
            org_id, warehouse_id, movement_type, product_id,
            quantity, reference_type, notes
          ) VALUES (
            ${scope.org_id}, ${scope.warehouse_id}, 'IN', ${product.id},
            2, 'PURCHASE_EDITED', ${marker}
          )
          RETURNING reference_type
        `;
        expect(movement.reference_type).toBe("PURCHASE_EDITED");
        throw new ExpectedRollback("rollback intencional del smoke test");
      });
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error;
    }

    const residue = await withTransaction(async (tx) => {
      const [row] = await tx<{ count: number }>`
        SELECT COUNT(*)::int AS count FROM products WHERE sku = ${marker}
      `;
      return Number(row.count);
    });
    expect(residue).toBe(0);
  });

  it("consume, registra, restaura y revierte sin dejar datos de prueba", async () => {
    const marker = `CODEx-FIFO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      await withTransaction(async (tx) => {
        const [scope] = await tx<{ org_id: number; warehouse_id: number }>`
          SELECT w.org_id, w.id AS warehouse_id
          FROM warehouses w
          JOIN organizations o ON o.id = w.org_id
          WHERE w.is_active = TRUE AND o.is_active = TRUE
          ORDER BY w.is_default DESC, w.id
          LIMIT 1
        `;

        expect(scope).toBeDefined();
        const orgId = Number(scope.org_id);
        const warehouseId = Number(scope.warehouse_id);

        const [product] = await tx<{ id: number }>`
          INSERT INTO products (org_id, name, sku, price, is_active, is_service)
          VALUES (${orgId}, ${marker}, ${marker}, 30, TRUE, FALSE)
          RETURNING id
        `;
        const productId = Number(product.id);

        const batches = await tx<{ id: number; qty_available: number }>`
          INSERT INTO inventory_batches (
            org_id, warehouse_id, product_id, variant_id,
            qty_in, qty_available, unit_cost, received_at
          )
          VALUES
            (${orgId}, ${warehouseId}, ${productId}, NULL, 5, 5, 10, NOW() - INTERVAL '2 days'),
            (${orgId}, ${warehouseId}, ${productId}, NULL, 7, 7, 20, NOW() - INTERVAL '1 day')
          RETURNING id, qty_available
        `;

        expect(batches).toHaveLength(2);
        expect(await supportsSaleItemBatchAllocations(tx)).toBe(true);

        const fifo = await consumeFifo(
          tx,
          orgId,
          productId,
          null,
          8,
          null,
          warehouseId,
        );

        expect(fifo).not.toBeNull();
        expect(fifo?.takes.map((take) => take.take)).toEqual([5, 3]);
        expect(fifo?.totalCost).toBe(110);

        const [sale] = await tx<{ id: number }>`
          INSERT INTO sales (
            org_id, warehouse_id, sale_number, subtotal, total,
            payment_method, status, notes
          )
          VALUES (${orgId}, ${warehouseId}, ${marker}, 240, 240, 'CASH', 'COMPLETED', ${marker})
          RETURNING id
        `;
        const saleId = Number(sale.id);

        const [saleItem] = await tx<{ id: number }>`
          INSERT INTO sale_items (
            org_id, sale_id, product_id, quantity,
            unit_price, unit_cost, line_total
          )
          VALUES (${orgId}, ${saleId}, ${productId}, 8, 30, 13.75, 240)
          RETURNING id
        `;
        const saleItemId = Number(saleItem.id);

        await recordSaleItemBatchAllocations(
          tx,
          orgId,
          saleId,
          saleItemId,
          fifo!.takes,
        );

        const consumedBatches = await tx<{ qty_available: number }>`
          SELECT qty_available
          FROM inventory_batches
          WHERE product_id = ${productId} AND org_id = ${orgId}
          ORDER BY received_at
        `;
        expect(consumedBatches.map((batch) => Number(batch.qty_available))).toEqual([0, 4]);

        const allocations = await tx<{ quantity: number; unit_cost: number }>`
          SELECT quantity, unit_cost
          FROM sale_item_batch_allocations
          WHERE sale_item_id = ${saleItemId} AND restored_at IS NULL
          ORDER BY inventory_batch_id
        `;
        expect(allocations.map((row) => [Number(row.quantity), Number(row.unit_cost)]))
          .toEqual([[5, 10], [3, 20]]);

        expect(
          await restoreSaleItemBatchAllocations(tx, orgId, saleItemId),
        ).toBe(8);

        const restoredBatches = await tx<{ qty_available: number }>`
          SELECT qty_available
          FROM inventory_batches
          WHERE product_id = ${productId} AND org_id = ${orgId}
          ORDER BY received_at
        `;
        expect(restoredBatches.map((batch) => Number(batch.qty_available))).toEqual([5, 7]);

        // Restaurar dos veces no debe duplicar existencias.
        expect(
          await restoreSaleItemBatchAllocations(tx, orgId, saleItemId),
        ).toBe(0);

        // Simula una edición: la misma línea vuelve a consumir solo 2 unidades.
        const editedFifo = await consumeFifo(
          tx,
          orgId,
          productId,
          null,
          2,
          null,
          warehouseId,
        );
        expect(editedFifo?.takes.map((take) => take.take)).toEqual([2]);

        await recordSaleItemBatchAllocations(
          tx,
          orgId,
          saleId,
          saleItemId,
          editedFifo!.takes,
        );

        const activeAfterEdit = await tx<{ quantity: number; unit_cost: number }>`
          SELECT quantity, unit_cost
          FROM sale_item_batch_allocations
          WHERE sale_item_id = ${saleItemId} AND restored_at IS NULL
          ORDER BY inventory_batch_id
        `;
        expect(activeAfterEdit.map((row) => [Number(row.quantity), Number(row.unit_cost)]))
          .toEqual([[2, 10]]);

        expect(
          await restoreSaleItemBatchAllocations(tx, orgId, saleItemId),
        ).toBe(2);

        // Pedir más de las 12 unidades disponibles debe fallar y devolver
        // cualquier toma provisional antes de salir.
        const insufficient = await consumeFifo(
          tx,
          orgId,
          productId,
          null,
          13,
          null,
          warehouseId,
        );
        expect(insufficient).toBeNull();

        const afterInsufficient = await tx<{ qty_available: number }>`
          SELECT qty_available
          FROM inventory_batches
          WHERE product_id = ${productId} AND org_id = ${orgId}
          ORDER BY received_at
        `;
        expect(afterInsufficient.map((batch) => Number(batch.qty_available))).toEqual([5, 7]);

        // Fuerza ROLLBACK para que ni siquiera el fixture quede persistido.
        throw new ExpectedRollback("rollback intencional del smoke test");
      });
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error;
    }

    const residue = await withTransaction(async (tx) => {
      const [row] = await tx<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM products
        WHERE name = ${marker} OR sku = ${marker}
      `;
      return Number(row.count);
    });

    expect(residue).toBe(0);
  });
});
