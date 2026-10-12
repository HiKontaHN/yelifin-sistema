jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(),
}));
jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}));
jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken: jest.fn() },
}));

import type { AuthUser } from "@/lib/auth";

const describeDatabase = process.env.RUN_DB_INTEGRATION === "1"
  ? describe
  : describe.skip;

describeDatabase("edición de ingresos — integración con la base de desarrollo", () => {
  jest.setTimeout(45_000);

  it("corrige lote y movimiento, y bloquea reducir unidades ya vendidas", async () => {
    const authModule = await import("@/lib/auth");
    const { withTransaction } = await import("@/lib/db-transaction");
    const marker = `CODEx-PURCHASE-ROUTE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let orgId = 0;
    let userId = 0;
    let warehouseId = 0;
    let productId = 0;
    let purchaseId = 0;
    let itemId = 0;

    try {
      await withTransaction(async (tx) => {
        const [scope] = await tx<{ org_id: number; user_id: number; warehouse_id: number }>`
          SELECT o.id AS org_id, o.owner_user_id AS user_id, w.id AS warehouse_id
          FROM organizations o
          JOIN warehouses w ON w.org_id = o.id AND w.is_active = TRUE
          WHERE o.is_active = TRUE
          ORDER BY w.is_default DESC, w.id
          LIMIT 1
        `;
        expect(scope).toBeDefined();
        orgId = Number(scope.org_id);
        userId = Number(scope.user_id);
        warehouseId = Number(scope.warehouse_id);

        const [product] = await tx<{ id: number }>`
          INSERT INTO products (org_id, created_by, name, sku, price, is_active, is_service)
          VALUES (${orgId}, ${userId}, ${marker}, ${marker}, 30, TRUE, FALSE)
          RETURNING id
        `;
        productId = Number(product.id);
        const [purchase] = await tx<{ id: number }>`
          INSERT INTO purchase_batches (
            org_id, created_by, currency, exchange_rate, subtotal, shipping,
            tax, total, is_paid, purchased_at, notes, status, warehouse_id
          ) VALUES (
            ${orgId}, ${userId}, 'HNL', 1, 50, 0,
            0, 50, TRUE, NOW(), ${marker}, 'COMPLETED', ${warehouseId}
          ) RETURNING id
        `;
        purchaseId = Number(purchase.id);
        const [item] = await tx<{ id: number }>`
          INSERT INTO purchase_batch_items (
            org_id, created_by, purchase_batch_id, product_id,
            quantity, unit_cost_usd, unit_cost, total_cost
          ) VALUES (${orgId}, ${userId}, ${purchaseId}, ${productId}, 5, 10, 10, 50)
          RETURNING id
        `;
        itemId = Number(item.id);
        await tx`
          INSERT INTO inventory_batches (
            org_id, created_by, product_id, purchase_batch_item_id,
            qty_in, qty_available, unit_cost, received_at, warehouse_id
          ) VALUES (${orgId}, ${userId}, ${productId}, ${itemId}, 5, 3, 10, NOW(), ${warehouseId})
        `;
        await tx`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, quantity,
            reference_type, reference_id, notes, warehouse_id
          ) VALUES (${orgId}, ${userId}, 'IN', ${productId}, 5, 'PURCHASE', ${purchaseId}, ${marker}, ${warehouseId})
        `;
      });

      const authUser: AuthUser = {
        userId,
        orgId,
        roleId: 0,
        roleName: "Dueño",
        isOwner: true,
        firebaseUid: marker,
        email: "integration@example.com",
        displayName: "Integration",
        emailVerified: true,
        isActive: true,
        subscription: { status: "ACTIVE", planSlug: "pro" },
      };
      const verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
        error: null,
        status: 200,
        data: authUser,
      });
      const { PATCH } = await import("@/app/api/purchases/[id]/route");

      const editResponse = await PATCH(new Request(`http://localhost/api/purchases/${purchaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", item_id: itemId, quantity: 7, unit_cost: 12 }),
      }) as never, { params: Promise.resolve({ id: String(purchaseId) }) });
      expect(editResponse.status).toBe(200);

      const state = await withTransaction(async (tx) => {
        const [row] = await tx<{
          quantity: number; qty_in: number; qty_available: number;
          item_cost: number; batch_cost: number; movement_quantity: number;
        }>`
          SELECT pbi.quantity, ib.qty_in, ib.qty_available,
                 pbi.unit_cost AS item_cost, ib.unit_cost AS batch_cost,
                 edited.quantity AS movement_quantity
          FROM purchase_batch_items pbi
          JOIN inventory_batches ib ON ib.purchase_batch_item_id = pbi.id
          JOIN inventory_movements edited
            ON edited.reference_id = pbi.purchase_batch_id
            AND edited.reference_type = 'PURCHASE_EDITED'
          WHERE pbi.id = ${itemId} AND pbi.org_id = ${orgId}
        `;
        return row;
      });
      expect(Number(state.quantity)).toBe(7);
      expect(Number(state.qty_in)).toBe(7);
      expect(Number(state.qty_available)).toBe(5);
      expect(Number(state.item_cost)).toBe(12);
      expect(Number(state.batch_cost)).toBe(12);
      expect(Number(state.movement_quantity)).toBe(2);

      const invalidResponse = await PATCH(new Request(`http://localhost/api/purchases/${purchaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", item_id: itemId, quantity: 1, unit_cost: 12 }),
      }) as never, { params: Promise.resolve({ id: String(purchaseId) }) });
      expect(invalidResponse.status).toBe(409);
      verifyAuthSpy.mockRestore();
    } finally {
      if (orgId && purchaseId && productId) {
        await withTransaction(async (tx) => {
          await tx`DELETE FROM inventory_movements WHERE org_id = ${orgId} AND reference_id = ${purchaseId} AND product_id = ${productId}`;
          await tx`DELETE FROM inventory_batches WHERE org_id = ${orgId} AND purchase_batch_item_id = ${itemId}`;
          await tx`DELETE FROM purchase_batches WHERE org_id = ${orgId} AND id = ${purchaseId}`;
          await tx`DELETE FROM products WHERE org_id = ${orgId} AND id = ${productId}`;
        });
      }
    }
  });
});

