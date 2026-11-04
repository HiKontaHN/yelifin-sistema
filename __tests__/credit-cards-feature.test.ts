import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockSql = jest.fn();
const mockRequireFeature = jest.fn();
const mockTransactionSql = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/auth", () => ({
  verifyAuthAndSubscription: jest.fn(async () => ({
    error: null,
    status: 200,
    data: {
      userId: 1,
      orgId: 7,
      roleId: 1,
      roleName: "Owner",
      isOwner: true,
      timezone: "America/Tegucigalpa",
    },
  })),
  isAuthSuccess: jest.fn(() => true),
  requireFeature: (...args: unknown[]) => mockRequireFeature(...args),
  requireModule: jest.fn(async () => null),
  verifyAnyModuleAccess: jest.fn(async () => true),
  getModulePermissions: jest.fn(async () => ({ canView: true })),
  nullifyKeysDeep: jest.fn((value: unknown) => value),
  verifyResourceLimit: jest.fn(async () => ({ withinLimit: true, status: 200 })),
  createErrorResponse: jest.fn((message: string, status: number, needsUpgrade = false) =>
    Response.json({ error: message, needs_upgrade: needsUpgrade }, { status }),
  ),
}));

jest.mock("@/lib/db-transaction", () => ({
  withTransaction: jest.fn(async (callback: (tx: typeof mockTransactionSql) => unknown) =>
    callback(mockTransactionSql),
  ),
}));

import { NextRequest } from "next/server";
import { GET as getCreditCards } from "@/app/api/credit-cards/route";
import { POST as createTransaction } from "@/app/api/transactions/route";

const denyCreditCards = () => {
  mockRequireFeature.mockImplementation(async (_orgId: number, featureKey: string) =>
    featureKey === "finances.credit_cards"
      ? Response.json({ error: "Requiere un plan superior" }, { status: 403 })
      : null,
  );
};

describe("feature de tarjetas de crédito", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockRequireFeature.mockReset();
    mockTransactionSql.mockReset();
  });

  it("responde 403 en una ruta de tarjetas cuando el plan no incluye la feature", async () => {
    denyCreditCards();

    const response = await getCreditCards(new NextRequest("http://localhost/api/credit-cards"));

    expect(response.status).toBe(403);
    expect(mockRequireFeature).toHaveBeenCalledWith(7, "finances.credit_cards");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("responde 200 en una ruta de tarjetas cuando el plan Pro incluye la feature", async () => {
    mockRequireFeature.mockResolvedValue(null);
    mockSql.mockResolvedValue([]);

    const response = await getCreditCards(new NextRequest("http://localhost/api/credit-cards"));

    expect(response.status).toBe(200);
    expect(mockRequireFeature).toHaveBeenCalledWith(7, "finances.credit_cards");
  });

  it("permite una transacción normal aunque el plan no incluya tarjetas", async () => {
    denyCreditCards();
    mockTransactionSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();
      if (query.includes("SELECT id, is_active FROM accounts")) {
        return [{ id: 3, is_active: true }];
      }
      if (query.includes("INSERT INTO transactions")) return [{ id: 41 }];
      return [];
    });

    const response = await createTransaction(new NextRequest("http://localhost/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        type: "EXPENSE",
        account_id: 3,
        amount: 25,
        description: "Compra normal",
        effective_date: "2026-11-04",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockRequireFeature).toHaveBeenCalledWith(7, "finances.transactions");
    expect(mockRequireFeature).not.toHaveBeenCalledWith(7, "finances.credit_cards");
  });

  it("asigna la feature solo a Pro, Original y Admin en la migración", () => {
    const sql = readFileSync(join(
      process.cwd(),
      "database",
      "migrations",
      "fix-subscriptions",
      "03-credit-cards-feature.sql",
    ), "utf8");

    expect(sql).toContain("'finances.credit_cards'");
    expect(sql).toContain("ON CONFLICT (feature_key) DO NOTHING");
    expect(sql).toContain("p.slug IN ('pro', 'original', 'admin')");
    expect(sql).toContain("p.slug IN ('free', 'basico', 'trial')");
    expect(sql).toMatch(/SET is_enabled = FALSE[\s\S]*p\.slug IN \('free', 'basico', 'trial'\)/);
  });
});
