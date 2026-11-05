import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CartMarginSummary } from "../cart-margin-summary";

const perms = { show_costs: true, show_profit: true };

jest.mock("@/hooks/use-module-permissions", () => ({
  useModulePermissions: () => perms,
}));

jest.mock("@/hooks/swr/use-currency", () => ({
  useCurrency: () => ({
    format: (value: number) => `L${value}`,
  }),
}));

jest.mock("@/context/privacy-mode-context", () => ({
  usePrivacyMode: () => ({
    mask: (value: string | number) => String(value),
  }),
}));

const cart = [
  {
    product_id: 1,
    variant_id: null,
    product_name: "Cafe",
    variant_name: null,
    image_url: null,
    quantity: 2,
    unit_price: 100,
    discount: 0,
    unit_cost: 40,
  },
];

const supplies = [
  { supply_id: 1, name: "Vaso", unit: "ud", quantity: 2, unit_cost: 5 },
];

function html() {
  return renderToStaticMarkup(
    createElement(CartMarginSummary, {
      cart,
      subtotal: 200,
      totalDiscount: 20,
      taxAmount: 18,
      suppliesUsed: supplies,
    }),
  );
}

describe("CartMarginSummary", () => {
  beforeEach(() => {
    perms.show_costs = true;
    perms.show_profit = true;
  });

  it("shows estimated profit, margin, and both costs", () => {
    const markup = html();
    expect(markup).toContain("Costo productos");
    expect(markup).toContain("-L80");
    expect(markup).toContain("Costo suministros");
    expect(markup).toContain("-L10");
    expect(markup).toContain("Ganancia estimada");
    expect(markup).toContain("L72");
    expect(markup).toContain("44.4% margen");
    expect(markup).toContain("FIFO");
    expect(markup).not.toContain("Envío");
  });

  it("shows costs without profit when only show_costs is on", () => {
    perms.show_profit = false;
    const markup = html();
    expect(markup).toContain("Costo productos");
    expect(markup).toContain("Costo suministros");
    expect(markup).not.toContain("Ganancia estimada");
    expect(markup).not.toContain("margen");
  });

  it("shows profit without the cost breakdown when only show_profit is on", () => {
    perms.show_costs = false;
    const markup = html();
    expect(markup).toContain("Ganancia estimada");
    expect(markup).toContain("44.4% margen");
    expect(markup).not.toContain("Costo productos");
    expect(markup).not.toContain("Costo suministros");
  });

  it("renders nothing without cost or profit permission", () => {
    perms.show_costs = false;
    perms.show_profit = false;
    expect(html()).toBe("");
  });

  it("renders nothing when a product cost is unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(CartMarginSummary, {
        cart: [{ ...cart[0], unit_cost: null }],
        subtotal: 200,
        totalDiscount: 0,
        taxAmount: 0,
        suppliesUsed: supplies,
      }),
    );
    expect(markup).toBe("");
  });
});
