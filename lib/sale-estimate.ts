// Estimado en vivo del margen de una venta.
// Misma fórmula que GET /api/sales/[id]:
//   netBase   = subtotal - descuento - ISV
//   netProfit = netBase - costoProductos - costoSuministros
// El envío no entra en el margen. El costo de producto es el promedio
// del inventario (o service_cost); el FIFO real se calcula al guardar.

export type ProductCostSource = {
  id: number;
  is_service: boolean;
  service_cost?: number | null;
};

export type InventoryCostSource = {
  product_id: number;
  base_avg_unit_cost: number | null;
  variants_stock: { variant_id: number; avg_unit_cost: number | null }[];
};

export type EstimatedCostLine = {
  quantity: number;
  unit_cost?: number | null;
};

export type EstimatedSupplyLine = {
  quantity: number;
  unit_cost?: number | null;
};

export type SaleEstimate = {
  productsCost: number;
  suppliesCost: number;
  netBase: number;
  netProfit: number;
  marginPct: number;
  /** False si falta el costo de algún producto o suministro. */
  costsKnown: boolean;
};

export function finiteCost(value: number | null | undefined): number | null {
  if (value == null) return null;
  const cost = Number(value);
  return Number.isFinite(cost) ? cost : null;
}

/** Costo de la línea si es finito; si no, el del catálogo. null si ninguno lo es. */
export function resolveSupplyUnitCost(
  provided: number | null | undefined,
  catalogCost: number | null | undefined,
): number | null {
  return finiteCost(provided) ?? finiteCost(catalogCost);
}

export function estimateUnitCost(
  product: ProductCostSource,
  variantId: number | null | undefined,
  inventory: InventoryCostSource[],
): number | null {
  if (product.is_service) return finiteCost(product.service_cost);

  const row = inventory.find((item) => item.product_id === product.id);
  if (!row) return null;

  if (variantId != null) {
    const variant = row.variants_stock.find((item) => item.variant_id === variantId);
    return finiteCost(variant?.avg_unit_cost);
  }

  return finiteCost(row.base_avg_unit_cost);
}

export function applyEstimatedUnitCosts<T extends {
  product_id: number;
  variant_id?: number | null;
  unit_cost?: number | null;
}>(
  cart: T[],
  products: ProductCostSource[],
  inventory: InventoryCostSource[],
): T[] {
  let changed = false;
  const next = cart.map((item) => {
    const product = products.find((row) => row.id === item.product_id);
    if (!product) return item;
    const cost = estimateUnitCost(product, item.variant_id, inventory);
    if ((item.unit_cost ?? null) === cost) return item;
    changed = true;
    return { ...item, unit_cost: cost };
  });
  return changed ? next : cart;
}

export function hydrateSupplyCosts<T extends {
  supply_id: number;
  unit_cost?: number | null;
}>(
  rows: T[],
  catalog: { id: number; unit_cost?: number | null }[],
): T[] {
  let changed = false;
  const next = rows.map((row) => {
    if (finiteCost(row.unit_cost) != null) return row;
    const match = catalog.find((supply) => supply.id === row.supply_id);
    const cost = finiteCost(match?.unit_cost);
    if (cost == null) return row;
    changed = true;
    return { ...row, unit_cost: cost };
  });
  return changed ? next : rows;
}

export function estimateSaleProfit(input: {
  subtotal: number;
  discount: number;
  tax: number;
  items: EstimatedCostLine[];
  supplies: EstimatedSupplyLine[];
}): SaleEstimate {
  const productCostsKnown = input.items.length > 0 && input.items.every(
    (item) => finiteCost(item.unit_cost) != null,
  );
  const supplyCostsKnown = input.supplies.every(
    (supply) => finiteCost(supply.unit_cost) != null,
  );
  const productsCost = input.items.reduce(
    (acc, item) => acc + (finiteCost(item.unit_cost) ?? 0) * item.quantity,
    0,
  );
  const suppliesCost = input.supplies.reduce(
    (acc, supply) => acc + supply.quantity * (finiteCost(supply.unit_cost) ?? 0),
    0,
  );
  const netBase = input.subtotal - input.discount - input.tax;
  const netProfit = netBase - productsCost - suppliesCost;
  const marginPct = netBase > 0 ? (netProfit / netBase) * 100 : 0;

  return {
    productsCost,
    suppliesCost,
    netBase,
    netProfit,
    marginPct,
    costsKnown: productCostsKnown && supplyCostsKnown,
  };
}
