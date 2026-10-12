jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}));

jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken: jest.fn() },
}));

const mockHttpSql = jest.fn();
const mockTxSql = jest.fn();
const mockWithTransaction = jest.fn(
  async <T>(callback: (sql: typeof mockTxSql) => Promise<T>) => callback(mockTxSql),
);

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockHttpSql),
}));

jest.mock("@/lib/db-transaction", () => ({
  withTransaction: <T>(callback: (sql: typeof mockTxSql) => Promise<T>) =>
    mockWithTransaction(callback),
}));

import * as authModule from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

function makeAuthUser(): AuthUser {
  return {
    userId: 42,
    orgId: 7,
    roleId: 1,
    roleName: "Dueño",
    isOwner: true,
    firebaseUid: "financial-atomicity-test",
    email: "test@example.com",
    displayName: "Test",
    emailVerified: true,
    isActive: true,
    subscription: { status: "ACTIVE", planSlug: "pro" },
  };
}

function makeRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function statements(): string[] {
  return mockTxSql.mock.calls.map(([strings]) =>
    (strings as TemplateStringsArray).join(" ? ").replace(/\s+/g, " ").trim(),
  );
}

describe("atomicidad de movimientos financieros", () => {
  let verifyAuthSpy: jest.SpyInstance;
  let resourceLimitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
    resourceLimitSpy = jest.spyOn(authModule, "verifyResourceLimit").mockResolvedValue({
      error: null,
      status: 200,
      withinLimit: true,
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
    resourceLimitSpy.mockRestore();
  });

  it("crea una transferencia y ambos cambios de saldo dentro de withTransaction", async () => {
    mockTxSql
      .mockResolvedValueOnce([{ id: 1, is_active: true }])
      .mockResolvedValueOnce([{ id: 2, is_active: true }])
      .mockResolvedValueOnce([{ id: 99 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(makeRequest("http://localhost/api/transactions", "POST", {
      type: "TRANSFER",
      account_id: 2,
      to_account_id: 1,
      amount: 125,
      description: "Transferencia de prueba",
    }) as never);

    expect(response.status).toBe(201);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(statements()).toEqual(expect.arrayContaining([
      expect.stringContaining("SELECT id, is_active FROM accounts"),
      expect.stringContaining("INSERT INTO transactions"),
      expect.stringContaining("balance = balance -"),
      expect.stringContaining("balance = balance +"),
    ]));
    expect(statements().filter((statement) => statement.includes("FOR UPDATE"))).toHaveLength(2);
  });

  it("rechaza un pago mayor que la deuda antes de escribir movimientos", async () => {
    mockTxSql
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([{ id: 20, balance: 100, balance_usd: 0 }]);

    const { POST } = await import("@/app/api/credit-cards/[id]/payment/route");
    const response = await POST(
      makeRequest("http://localhost/api/credit-cards/20/payment", "POST", {
        account_id: 10,
        amount: 150,
        currency: "HNL",
      }) as never,
      { params: Promise.resolve({ id: "20" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "El monto del pago no puede superar el saldo pendiente de la tarjeta",
    });
    expect(mockTxSql).toHaveBeenCalledTimes(2);
    expect(statements().some((statement) => statement.includes("INSERT INTO"))).toBe(false);
  });

  it("registra las dos caras de un pago y los saldos en una sola transacción", async () => {
    mockTxSql
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([{ id: 20, balance: 300, balance_usd: 0 }])
      .mockResolvedValueOnce([{ id: 501 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 601 }])
      .mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/credit-cards/[id]/payment/route");
    const response = await POST(
      makeRequest("http://localhost/api/credit-cards/20/payment", "POST", {
        account_id: 10,
        amount: 125,
        currency: "HNL",
        category: "Pago tarjeta",
      }) as never,
      { params: Promise.resolve({ id: "20" }) },
    );

    expect(response.status).toBe(201);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(statements()).toEqual(expect.arrayContaining([
      expect.stringContaining("INSERT INTO transactions"),
      expect.stringContaining("UPDATE accounts"),
      expect.stringContaining("INSERT INTO credit_card_transactions"),
      expect.stringContaining("UPDATE credit_cards"),
    ]));
  });

  it("bloquea la edición directa de la transacción contable de un pago de tarjeta", async () => {
    mockTxSql.mockResolvedValueOnce([{
      id: 501,
      type: "EXPENSE",
      amount: 125,
      account_id: 10,
      to_account_id: null,
      reference_type: "CREDIT_CARD_PAYMENT",
      category: "Pago tarjeta",
      description: "Pago",
      occurred_at: "2026-10-12T12:00:00.000Z",
    }]);

    const { PATCH } = await import("@/app/api/transactions/[id]/route");
    const response = await PATCH(
      makeRequest("http://localhost/api/transactions/501", "PATCH", { amount: 100 }) as never,
      { params: Promise.resolve({ id: "501" }) },
    );

    expect(response.status).toBe(422);
    expect(mockTxSql).toHaveBeenCalledTimes(1);
  });

  it("bloquea la edición de un cargo vinculado a una compra de inventario", async () => {
    mockTxSql.mockResolvedValueOnce([{
      id: 601,
      type: "CHARGE",
      amount: 125,
      currency: "HNL",
      exchange_rate: null,
      amount_local: 125,
      sale_id: null,
      purchase_batch_id: 88,
      credit_card_id: 20,
      description: "Compra inventario",
      category: "Inventario",
      occurred_at: "2026-10-12T12:00:00.000Z",
    }]);

    const { PATCH } = await import("@/app/api/credit-card-transactions/[id]/route");
    const response = await PATCH(
      makeRequest("http://localhost/api/credit-card-transactions/601", "PATCH", { amount: 100 }) as never,
      { params: Promise.resolve({ id: "601" }) },
    );

    expect(response.status).toBe(422);
    expect(mockTxSql).toHaveBeenCalledTimes(1);
  });
});
