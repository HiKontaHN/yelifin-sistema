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
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/finances/view/route";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("GET /api/finances/view", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("ejecuta resumen, cuentas y tarjetas en paralelo y arma el contrato completo", async () => {
    const summary = deferred<Record<string, unknown>[]>();
    const accounts = deferred<Record<string, unknown>[]>();
    const cards = deferred<Record<string, unknown>[]>();
    const started = new Set<string>();

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();
      if (query.includes("WITH period_transactions AS MATERIALIZED")) {
        started.add("summary");
        return summary.promise;
      }
      if (query.includes("historical_balance")) {
        started.add("accounts");
        return accounts.promise;
      }
      if (query.includes("FROM credit_cards") && query.includes("is_active = TRUE")) {
        started.add("cards");
        return cards.promise;
      }
      throw new Error(`Consulta inesperada: ${query}`);
    });

    const responsePromise = GET(new NextRequest(
      "http://localhost/api/finances/view?month=10&year=2026&tz_offset=360",
    ));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(started).toEqual(new Set(["summary", "accounts", "cards"]));

    summary.resolve([{
      period_income: "1000",
      period_expense: "400",
      today_income: "200",
      today_expense: "50",
      today_count: 2,
      cash_flow: [{ date: "2026-10-12", income: 200, expense: 50 }],
      recent_transactions: [{ id: 9, type: "INCOME", amount: 200 }],
      available_periods: [{ year: 2026, month: 10 }],
    }]);
    accounts.resolve([{
      id: 3,
      name: "Banco",
      type: "BANK",
      balance: "800",
      historical_balance: "750",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    }]);
    cards.resolve([{ id: 4, name: "Visa", balance: "100", balance_usd: "0" }]);

    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.summary).toMatchObject({
      accounts: [{ id: 3, name: "Banco", type: "BANK", balance: 750 }],
      period: { income: 1000, expense: 400 },
      today: { income: 200, expense: 50, count: 2 },
      cash_flow: [{ date: "2026-10-12", income: 200, expense: 50 }],
      today_transactions: [{ id: 9, type: "INCOME", amount: 200 }],
    });
    expect(body.data.periods).toEqual([{ year: 2026, month: 10 }]);
    expect(body.data.accounts).toEqual([{
      id: 3,
      name: "Banco",
      type: "BANK",
      balance: "800",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    }]);
    expect(body.data.credit_cards).toEqual([
      { id: 4, name: "Visa", balance: "100", balance_usd: "0" },
    ]);
  });
});
