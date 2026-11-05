import {
  applyEstimatedUnitCosts,
  estimateSaleProfit,
  estimateUnitCost,
  finiteCost,
  hydrateSupplyCosts,
  resolveSupplyUnitCost,
} from "../sale-estimate";

const inventory = [
  {
    product_id: 1,
    base_avg_unit_cost: 40,
    variants_stock: [{ variant_id: 9, avg_unit_cost: 55 }],
  },
  {
    product_id: 2,
    base_avg_unit_cost: null,
    variants_stock: [],
  },
];

describe("resolveSupplyUnitCost", () => {
  it("keeps null instead of turning it into zero", () => {
    expect(finiteCost(null)).toBeNull();
    expect(resolveSupplyUnitCost(null, null)).toBeNull();
    expect(resolveSupplyUnitCost(undefined, Number.NaN)).toBeNull();
  });

  it("uses the line cost, then the catalog, including a real zero", () => {
    expect(resolveSupplyUnitCost(0, 4)).toBe(0);
    expect(resolveSupplyUnitCost(null, 4)).toBe(4);
    expect(resolveSupplyUnitCost(2.5, 4)).toBe(2.5);
  });
});

describe("estimateUnitCost", () => {
  it("uses base average, variant average, service cost, or null when hidden", () => {
    expect(estimateUnitCost({ id: 1, is_service: false }, null, inventory)).toBe(40);
    expect(estimateUnitCost({ id: 1, is_service: false }, 9, inventory)).toBe(55);
    expect(estimateUnitCost({ id: 2, is_service: false }, null, inventory)).toBeNull();
    expect(estimateUnitCost({ id: 3, is_service: true, service_cost: 12 }, null, inventory)).toBe(12);
  });
});

describe("estimateSaleProfit", () => {
  it("matches the sale detail formula and leaves shipping out", () => {
    const estimate = estimateSaleProfit({
      subtotal: 200,
      discount: 20,
      tax: 18,
      items: [{ quantity: 2, unit_cost: 40 }],
      supplies: [{ quantity: 3, unit_cost: 5 }],
    });

    expect(estimate.productsCost).toBe(80);
    expect(estimate.suppliesCost).toBe(15);
    expect(estimate.netBase).toBe(162);
    expect(estimate.netProfit).toBe(67);
    expect(estimate.marginPct).toBeCloseTo((67 / 162) * 100);
    expect(estimate.costsKnown).toBe(true);
  });

  it("does not treat a missing cost as zero", () => {
    const estimate = estimateSaleProfit({
      subtotal: 100,
      discount: 0,
      tax: 0,
      items: [{ quantity: 1, unit_cost: null }],
      supplies: [{ quantity: 1, unit_cost: null }],
    });

    expect(estimate.costsKnown).toBe(false);
    expect(estimate.netProfit).toBe(100);
  });

  it("reports 0% margin when the net base is not positive", () => {
    const estimate = estimateSaleProfit({
      subtotal: 100,
      discount: 100,
      tax: 0,
      items: [{ quantity: 1, unit_cost: 10 }],
      supplies: [],
    });

    expect(estimate.netProfit).toBe(-10);
    expect(estimate.marginPct).toBe(0);
  });
});

describe("cart cost hydration", () => {
  it("fills estimated unit costs without reallocating an unchanged cart", () => {
    const cart = applyEstimatedUnitCosts(
      [{ product_id: 1, variant_id: 9, unit_cost: null, quantity: 1 }],
      [{ id: 1, is_service: false }],
      inventory,
    );
    expect(cart[0].unit_cost).toBe(55);

    const again = applyEstimatedUnitCosts(cart, [{ id: 1, is_service: false }], inventory);
    expect(again).toBe(cart);
  });

  it("fills only supply costs the sale payload omitted", () => {
    const rows = hydrateSupplyCosts(
      [
        { supply_id: 4, unit_cost: null },
        { supply_id: 5, unit_cost: 8 },
      ],
      [{ id: 4, unit_cost: 3 }],
    );

    expect(rows[0].unit_cost).toBe(3);
    expect(rows[1].unit_cost).toBe(8);
  });
});
