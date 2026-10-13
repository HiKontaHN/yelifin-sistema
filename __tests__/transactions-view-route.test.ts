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
import { GET } from "@/app/api/finances/transactions-view/route";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("GET /api/finances/transactions-view", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("inicia los seis bloques de datos en paralelo y conserva el contrato de la vista", async () => {
    const transactions = deferred<Record<string, unknown>[]>();
    const totals = deferred<Record<string, unknown>[]>();
    const cardTransactions = deferred<Record<string, unknown>[]>();
    const periods = deferred<Record<string, unknown>[]>();
    const accounts = deferred<Record<string, unknown>[]>();
    const cards = deferred<Record<string, unknown>[]>();
    const started = new Set<string>();

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();

      // Fragmentos condicionales interpolados por las consultas principales.
      if (!query || query.startsWith("AND ")) return query;

      if (query.includes("FROM transactions t") && query.includes("JOIN accounts a")) {
        started.add("transactions");
        return transactions.promise;
      }
      if (query.includes("SUM(CASE WHEN type = 'INCOME'")) {
        started.add("totals");
        return totals.promise;
      }
      if (query.includes("FROM credit_card_transactions cct")) {
        started.add("cardTransactions");
        return cardTransactions.promise;
      }
      if (query.includes("available_periods")) {
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

    const responsePromise = GET(new NextRequest(
      "http://localhost/api/finances/transactions-view?month=10&year=2026&source=all",
    ));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(started).toEqual(new Set([
      "transactions",
      "totals",
      "cardTransactions",
      "periods",
      "accounts",
      "cards",
    ]));

    transactions.resolve([{ id: 1, type: "INCOME", amount: "100" }]);
    totals.resolve([{
      total_income: "100",
      total_expense: "30",
      total_transfer: "10",
      total_count: 3,
    }]);
    cardTransactions.resolve([{ id: 2, type: "CHARGE", amount: "30" }]);
    periods.resolve([{ year: 2026, month: 10 }]);
    accounts.resolve([{ id: 4, name: "Banco", balance: "500" }]);
    cards.resolve([{ id: 5, name: "Visa", balance: "30" }]);

    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totals).toEqual({ income: 100, expense: 30, transfer: 10, count: 3 });
    expect(body.data).toMatchObject({
      transactions: [{ id: 1, type: "INCOME", amount: "100" }],
      credit_card_transactions: [{ id: 2, type: "CHARGE", amount: "30" }],
      periods: [{ year: 2026, month: 10 }],
      accounts: [{ id: 4, name: "Banco", balance: "500" }],
      credit_cards: [{ id: 5, name: "Visa", balance: "30" }],
    });
  });
});
