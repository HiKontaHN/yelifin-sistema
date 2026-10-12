import { recalculatePurchaseItems } from "@/lib/purchase-edit";

describe("recalculatePurchaseItems", () => {
  const items = [
    { id: 1, quantity: 2, unit_cost_usd: 10 },
    { id: 2, quantity: 3, unit_cost_usd: 20 },
  ];

  it("redistribuye el envío al cambiar la cantidad en HNL", () => {
    const result = recalculatePurchaseItems({
      items,
      targetItemId: 1,
      quantity: 5,
      unitCostInCurrency: 12,
      currency: "HNL",
      exchangeRate: 1,
      shipping: 16,
    });

    expect(result.shippingPerUnit).toBe(2);
    expect(result.items[0]).toMatchObject({
      next_quantity: 5,
      next_base_cost: 12,
      next_unit_cost: 14,
      next_total_cost: 70,
    });
    expect(result.items[1].next_unit_cost).toBe(22);
    expect(result.productsLocal).toBe(120);
    expect(result.totalLocal).toBe(136);
  });

  it("conserva el costo de tarjeta en USD y calcula el costo FIFO en HNL", () => {
    const result = recalculatePurchaseItems({
      items: [{ id: 1, quantity: 2, unit_cost_usd: 10 }],
      targetItemId: 1,
      quantity: 3,
      unitCostInCurrency: 15,
      currency: "USD",
      exchangeRate: 25,
      shipping: 30,
    });

    expect(result.totalInCurrency).toBe(45);
    expect(result.productsLocal).toBe(1125);
    expect(result.items[0].next_unit_cost).toBe(385);
    expect(result.totalLocal).toBe(1155);
  });
});

