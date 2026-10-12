export type PurchaseEditItem = {
  id: number | string;
  quantity: number | string;
  unit_cost_usd: number | string;
  [key: string]: any;
};

export type RecalculatedPurchaseItem<T extends PurchaseEditItem> = T & {
  next_quantity: number;
  next_base_cost: number;
  next_unit_cost: number;
  next_total_cost: number;
};

/** Recalcula el costo local de todos los lotes al redistribuir el envío fijo. */
export function recalculatePurchaseItems<T extends PurchaseEditItem>({
  items,
  targetItemId,
  quantity,
  unitCostInCurrency,
  currency,
  exchangeRate,
  shipping,
}: {
  items: T[];
  targetItemId: number;
  quantity: number;
  unitCostInCurrency: number;
  currency: string;
  exchangeRate: number;
  shipping: number;
}) {
  const isUsd = currency.toUpperCase() === "USD";
  const nextItems = items.map((item) => ({
    ...item,
    next_quantity: Number(item.id) === targetItemId ? quantity : Number(item.quantity),
    next_base_cost: Number(item.id) === targetItemId
      ? unitCostInCurrency
      : Number(item.unit_cost_usd),
    next_unit_cost: 0,
    next_total_cost: 0,
  })) as RecalculatedPurchaseItem<T>[];
  const totalUnits = nextItems.reduce((sum, item) => sum + item.next_quantity, 0);
  const shippingPerUnit = totalUnits > 0 ? shipping / totalUnits : 0;
  let productsLocal = 0;
  let totalInCurrency = 0;

  for (const item of nextItems) {
    const baseLocal = isUsd
      ? item.next_base_cost * exchangeRate
      : item.next_base_cost;
    item.next_unit_cost = baseLocal + shippingPerUnit;
    item.next_total_cost = item.next_unit_cost * item.next_quantity;
    productsLocal += baseLocal * item.next_quantity;
    totalInCurrency += item.next_base_cost * item.next_quantity;
  }

  return {
    items: nextItems,
    shippingPerUnit,
    productsLocal,
    totalInCurrency,
    totalLocal: productsLocal + shipping,
  };
}

