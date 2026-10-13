const mockSql = jest.fn();
const mockGetModulePermissions = jest.fn();

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
  getModulePermissions: (...args: unknown[]) => mockGetModulePermissions(...args),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/credit-cards/[id]/view/route";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("GET /api/credit-cards/[id]/view", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockGetModulePermissions.mockReset();
  });

  it("valida la tarjeta una vez y luego inicia todos los datos independientes en paralelo", async () => {
    const statement = deferred<Record<string, unknown>[]>();
    const transactions = deferred<Record<string, unknown>[]>();
    const totals = deferred<Record<string, unknown>[]>();
    const periods = deferred<Record<string, unknown>[]>();
    const accounts = deferred<Record<string, unknown>[]>();
    const cards = deferred<Record<string, unknown>[]>();
    const accountPermissions = deferred<Record<string, boolean>>();
    const started = new Set<string>();

    mockGetModulePermissions.mockImplementation(() => {
      started.add("permissions");
      return accountPermissions.promise;
    });

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();

      if (query.includes("FROM credit_cards") && query.includes("WHERE id =")) {
        return Promise.resolve([{
          id: 12,
          name: "Visa",
          balance: "300",
          balance_usd: "20",
          statement_closing_day: 15,
        }]);
      }
      if (query.includes("statement_balance_local")) {
        started.add("statement");
        return statement.promise;
      }
      if (query.includes("FROM credit_card_transactions cct")) {
        started.add("transactions");
        return transactions.promise;
      }
      if (query.includes("total_charges_local")) {
        started.add("totals");
        return totals.promise;
      }
      if (query.includes("SELECT DISTINCT") && query.includes("occurred_at")) {
        started.add("periods");
        return periods.promise;
      }
      if (query.includes("FROM accounts") && query.includes("is_active = TRUE")) {
        started.add("accounts");
        return accounts.promise;
      }
      if (query.includes("FROM credit_cards") && query.includes("is_active = TRUE")) {
        started.add("cards");
        return cards.promise;
      }

      throw new Error(`Consulta inesperada: ${query}`);
    });

    const responsePromise = GET(
      new NextRequest("http://localhost/api/credit-cards/12/view?month=10&year=2026&tz_offset=360"),
      { params: Promise.resolve({ id: "12" }) },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(started).toEqual(new Set([
      "statement",
      "transactions",
      "totals",
      "periods",
      "accounts",
      "cards",
      "permissions",
    ]));

    statement.resolve([{ statement_balance_local: "120", statement_balance_usd: "8" }]);
    transactions.resolve([{ id: 2, type: "CHARGE", amount: "30" }]);
    totals.resolve([{
      total_charges_local: "30",
      total_charges_usd: "4",
      total_payments_local: "10",
      total_payments_usd: "1",
      total_count: 3,
    }]);
    periods.resolve([{ year: 2026, month: 10 }]);
    accounts.resolve([{ id: 4, name: "Banco", balance: "500" }]);
    cards.resolve([{ id: 12, name: "Visa" }]);
    accountPermissions.resolve({ canView: true });

    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.credit_card).toMatchObject({
      id: 12,
      name: "Visa",
      statement_balance_local: 120,
      statement_balance_usd: 8,
    });
    expect(body.data.transactions).toEqual([{ id: 2, type: "CHARGE", amount: "30" }]);
    expect(body.data.periods).toEqual([{ year: 2026, month: 10 }]);
    expect(body.totals).toEqual({
      charges_local: 30,
      charges_usd: 4,
      payments_local: 10,
      payments_usd: 1,
      count: 3,
    });
  });
});
