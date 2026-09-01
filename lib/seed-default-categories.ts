// lib/seed-default-categories.ts
import { NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Categoría con la que se etiquetan automáticamente las transacciones
 * generadas por una compra de inventario (compra individual, por lote,
 * confirmación de llegada e import por Excel).
 *
 * transactions.category y credit_card_transactions.category guardan el
 * NOMBRE de la categoría como texto libre — no hay FK contra
 * transaction_categories — así que este string debe coincidir exactamente
 * con el nombre sembrado abajo. Si se renombra, hace falta una migración
 * que actualice las transacciones existentes
 * (ver database/migrations/v4.14-inventory-purchase-category.sql).
 */
export const INVENTORY_PURCHASE_CATEGORY = "Compra de Inventario";

const DEFAULT_CATEGORIES = [
  // INCOME
  { name: "Ventas", type: "INCOME" },
  { name: "Servicios", type: "INCOME" },
  { name: "Inversiones", type: "INCOME" },
  { name: "Comisiones", type: "INCOME" },
  { name: "Reembolsos", type: "INCOME" },
  { name: "Otros ingresos", type: "INCOME" },
  // EXPENSE
  { name: "Nómina", type: "EXPENSE" },
  { name: "Servicios", type: "EXPENSE" },
  { name: INVENTORY_PURCHASE_CATEGORY, type: "EXPENSE" },
  { name: "Marketing", type: "EXPENSE" },
  { name: "Renta", type: "EXPENSE" },
  { name: "Mantenimiento", type: "EXPENSE" },
  { name: "Impuestos", type: "EXPENSE" },
  { name: "Transporte", type: "EXPENSE" },
  { name: "Equipamiento", type: "EXPENSE" },
  { name: "Seguros", type: "EXPENSE" },
  { name: "Otros gastos", type: "EXPENSE" },
  // TRANSFER
  { name: "Transferencia", type: "TRANSFER" },
];

export async function seedDefaultCategories(
  orgId: number,
  userId: number,
  sql: NeonQueryFunction<false, false>
) {
  await Promise.all(
    DEFAULT_CATEGORIES.map(
      (cat) =>
        sql`
          INSERT INTO transaction_categories (org_id, created_by, name, type)
          VALUES (${orgId}, ${userId}, ${cat.name}, ${cat.type})
          ON CONFLICT (org_id, name, type) DO NOTHING
        `
    )
  );
}
