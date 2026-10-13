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
import { GET } from "@/app/api/credit-cards/view/route";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("GET /api/credit-cards/view", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockGetModulePermissions.mockReset();
  });

  it("inicia tarjetas, cuentas, períodos y movimientos en paralelo", async () => {
    const cards = deferred<Record<string, unknown>[]>();
    const accounts = deferred<Record<string, unknown>[]>();
    const periods = deferred<Record<string, unknown>[]>();
    const transactions = deferred<Record<string, unknown>[]>();
    const permissions = deferred<Record<string, boolean>>();
    const started = new Set<string>();

    mockGetModulePermissions.mockImplementation(() => {
      started.add("permissions");
      return permissions.promise;
    });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();
      if (!query || query.startsWith("AND ")) return query;

      if (query.includes("FROM credit_cards") && query.includes("is_active = TRUE")) {
        started.add("cards");
        return cards.promise;
      }
      if (query.includes("FROM accounts") && query.includes("is_active = TRUE")) {
        started.add("accounts");
        return accounts.promise;
      }
      if (query.includes("SELECT DISTINCT") && query.includes("credit_card_transactions")) {
        started.add("periods");
        return periods.promise;
      }
      if (query.includes("FROM credit_card_transactions cct")) {
        started.add("transactions");
        return transactions.promise;
      }

      throw new Error(`Consulta inesperada: ${query}`);
    });

    const responsePromise = GET(new NextRequest(
      "http://localhost/api/credit-cards/view?month=10&year=2026&card_id=12&tz_offset=360",
    ));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(started).toEqual(new Set([
      "cards",
      "accounts",
      "periods",
      "transactions",
      "permissions",
    ]));

    cards.resolve([{ id: 12, name: "Visa", balance: "100" }]);
    accounts.resolve([{ id: 3, name: "Banco", balance: "500" }]);
    periods.resolve([{ year: 2026, month: 10 }]);
    transactions.resolve([{ id: 8, credit_card_id: 12, type: "CHARGE" }]);
    permissions.resolve({ canView: true });

    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      credit_cards: [{ id: 12, name: "Visa", balance: "100" }],
      accounts: [{ id: 3, name: "Banco", balance: "500" }],
      periods: [{ year: 2026, month: 10 }],
      transactions: [{ id: 8, credit_card_id: 12, type: "CHARGE" }],
    });
  });
});
