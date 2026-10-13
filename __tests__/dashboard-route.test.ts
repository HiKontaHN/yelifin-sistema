const mockSql = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/auth", () => ({
  verifyAuth: jest.fn(async () => ({
    error: null,
    status: 200,
    data: {
      userId: 1,
      orgId: 7,
      roleId: 1,
      roleName: "Owner",
      isOwner: true,
    },
  })),
  isAuthSuccess: jest.fn(() => true),
  requireModule: jest.fn(async () => null),
  getModulePermissions: jest.fn(async () => ({ showCosts: true, showProfit: true })),
  getOrgTimezone: jest.fn(async () => "America/Tegucigalpa"),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/dashboard/route";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("ejecuta tres bloques de consulta en paralelo y conserva el contrato", async () => {
    const summary = deferred<Record<string, unknown>[]>();
    const analytics = deferred<Record<string, unknown>[]>();
    const inventory = deferred<Record<string, unknown>[]>();

    mockSql
      .mockReturnValueOnce(summary.promise)
      .mockReturnValueOnce(analytics.promise)
      .mockReturnValueOnce(inventory.promise);

    const responsePromise = GET(new NextRequest("http://localhost/api/dashboard?month=10&year=2026"));

    await new Promise<void>((resolve) => setImmediate(resolve));

    // Las tres promesas deben iniciarse antes de que se resuelva la primera.
    expect(mockSql).toHaveBeenCalledTimes(3);

    summary.resolve([{
      revenue_this: "1000",
      revenue_last: "800",
      sales_count: 4,
      profit_this: "300",
      profit_last: "200",
      customers_total: 10,
      customers_new: 2,
      accounts_balance: "5000",
      credit_card_debt_local: "250",
      credit_card_debt_usd: "15",
      available_periods: [{ year: 2026, month: 10 }],
    }]);
    analytics.resolve([{
      sales_chart: [{ date: "2026-10-01", revenue: 1000, profit: 300 }],
      payment_methods: [{ method: "CASH", amount: 1000 }],
      top_products: [{ id: 2, name: "Producto", image_url: null, units_sold: 4, revenue: 1000, profit: 300 }],
      recent_sales: [{
        id: 3,
        sale_number: "V-3",
        total: 1000,
        payment_method: "CASH",
        sold_at: "2026-10-01T12:00:00.000Z",
        customer_name: null,
        items_count: 1,
        profit: 300,
      }],
    }]);
    inventory.resolve([{
      total_products: 5,
      total_units: 20,
      total_value: "400",
      out_of_stock: 1,
      low_stock: 2,
      low_stock_items: [{ id: 4, name: "Bajo", sku: "B-1", image_url: null, stock: 1 }],
    }]);

    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.metrics).toMatchObject({
      revenue: 1000,
      revenue_change: 25,
      profit: 300,
      profit_change: 50,
      sales_count: 4,
      customers_total: 10,
      customers_new: 2,
      balance: 5000,
    });
    expect(body.data.sales_chart).toEqual([
      { date: "2026-10-01", revenue: 1000, profit: 300 },
    ]);
    expect(body.data.periods).toEqual([{ year: 2026, month: 10 }]);
    expect(body.data.low_stock).toEqual([
      { id: 4, name: "Bajo", sku: "B-1", image_url: null, stock: 1 },
    ]);
  });
});
