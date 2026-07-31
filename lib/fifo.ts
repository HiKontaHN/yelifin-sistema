// lib/fifo.ts
// Consumo FIFO de inventory_batches seguro ante concurrencia.
//
// El problema: leer los lotes y luego descontarlos en statements separados
// permite que dos ventas simultáneas compitan por el mismo lote y una
// sobregire el stock (el CHECK qty_available >= 0 lo convierte en un 500).
//
// La solución: cada descuento es UN solo UPDATE atómico que toma
// LEAST(pendiente, qty_available) y exige qty_available >= take. Si otro
// proceso consumió el lote entre la lectura y el UPDATE, la guarda hace que
// el UPDATE afecte 0 filas y simplemente se reintenta con lotes frescos.
// El stock nunca queda negativo y nunca se vende más de lo disponible.

export class InsufficientStockError extends Error {
  constructor(public label: string, public available?: number) {
    super(`Stock insuficiente para "${label}"`);
    this.name = "InsufficientStockError";
  }
}

export type FifoTake = { batch_id: number; take: number; unit_cost: number };

export type FifoResult = { takes: FifoTake[]; totalCost: number };

/**
 * Descuenta `quantity` unidades del producto/variante en orden FIFO.
 * Devuelve los lotes afectados y el costo real consumido, o `null` si no
 * alcanzó el stock (en ese caso ya restauró lo que había tomado).
 */
export async function consumeFifo(
  sql: any,
  orgId: number,
  productId: number,
  variantId: number | null,
  quantity: number
): Promise<FifoResult | null> {
  let remaining = quantity;
  let totalCost = 0;
  const takes: FifoTake[] = [];

  // Hasta 3 pasadas: si un lote fue consumido por otro proceso entre la
  // lectura y el UPDATE, la siguiente pasada lee el estado fresco.
  for (let attempt = 0; attempt < 3 && remaining > 0; attempt++) {
    const batches =
      variantId !== null
        ? await sql`
            SELECT id FROM inventory_batches
            WHERE org_id     = ${orgId}
              AND product_id = ${productId}
              AND variant_id = ${variantId}
              AND qty_available > 0
            ORDER BY received_at ASC
          `
        : await sql`
            SELECT id FROM inventory_batches
            WHERE org_id     = ${orgId}
              AND product_id = ${productId}
              AND variant_id IS NULL
              AND qty_available > 0
            ORDER BY received_at ASC
          `;

    if (batches.length === 0) break;

    let progressed = false;
    for (const b of batches) {
      if (remaining <= 0) break;
      // Toma atómica: LEAST(pendiente, disponible) con guarda >= take.
      const [row] = await sql`
        WITH t AS (
          SELECT id, LEAST(${remaining}::int, qty_available) AS take, unit_cost
          FROM inventory_batches
          WHERE id = ${b.id} AND org_id = ${orgId} AND qty_available > 0
        )
        UPDATE inventory_batches ib
        SET qty_available = ib.qty_available - t.take
        FROM t
        WHERE ib.id = t.id AND ib.qty_available >= t.take
        RETURNING t.take AS take, t.unit_cost AS unit_cost
      `;
      if (row && Number(row.take) > 0) {
        remaining -= Number(row.take);
        totalCost += Number(row.take) * Number(row.unit_cost);
        takes.push({
          batch_id: b.id,
          take: Number(row.take),
          unit_cost: Number(row.unit_cost),
        });
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  if (remaining > 0) {
    await restoreTakes(sql, orgId, takes);
    return null;
  }
  return { takes, totalCost };
}

/** Devuelve al inventario lo tomado por un consumeFifo fallido/revertido. */
export async function restoreTakes(sql: any, orgId: number, takes: FifoTake[]) {
  for (const t of takes) {
    await sql`
      UPDATE inventory_batches
      SET qty_available = qty_available + ${t.take}
      WHERE id = ${t.batch_id} AND org_id = ${orgId}
    `;
  }
}
