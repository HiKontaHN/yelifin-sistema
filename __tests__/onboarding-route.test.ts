const mockSql = jest.fn();
const mockTx = jest.fn();
const mockVerifyAuth = jest.fn();
const mockVerifyResourceLimit = jest.fn();
const mockWithTransaction = jest.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) =>
  callback(mockTx),
);

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/auth", () => ({
  verifyAuth: mockVerifyAuth,
  isAuthSuccess: jest.fn((result) => result.error === null),
  verifyResourceLimit: mockVerifyResourceLimit,
  createErrorResponse: jest.fn((message: string, status: number, needsUpgrade = false) =>
    Response.json({ error: message, needs_upgrade: needsUpgrade }, { status }),
  ),
}));

jest.mock("@/lib/db-transaction", () => ({
  withTransaction: mockWithTransaction,
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/onboarding/route";

const ownerAuth = {
  error: null,
  status: 200,
  data: {
    userId: 1,
    orgId: 7,
    isOwner: true,
    firebaseUid: "firebase-1",
    subscription: { planSlug: "gratis" },
  },
};

function onboardingRequest() {
  return new NextRequest("http://localhost/api/onboarding", {
    method: "POST",
    body: JSON.stringify({
      currency: "HNL",
      accounts: [{ name: "Efectivo", type: "CASH", balance: 100 }],
    }),
  });
}

function queryText(call: unknown[]) {
  return (call[0] as TemplateStringsArray).join(" ").replace(/\s+/g, " ").trim();
}

describe("POST /api/onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(ownerAuth);
    mockVerifyResourceLimit.mockResolvedValue({
      error: null,
      status: 200,
      withinLimit: true,
    });
    mockTx.mockResolvedValue([]);
  });

  it("rechaza a un miembro que no sea dueño antes de escribir", async () => {
    mockVerifyAuth.mockResolvedValue({
      ...ownerAuth,
      data: { ...ownerAuth.data, isOwner: false },
    });

    const response = await POST(onboardingRequest());

    expect(response.status).toBe(403);
    expect(mockVerifyResourceLimit).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it("rechaza repetir un onboarding ya completado", async () => {
    mockTx.mockResolvedValueOnce([{ onboarding_completed: true }]);

    const response = await POST(onboardingRequest());

    expect(response.status).toBe(409);
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(queryText(mockTx.mock.calls[0])).toContain("FOR UPDATE");
  });

  it("crea cuentas sin sobrescribir existentes y dentro de una transacción", async () => {
    mockTx.mockResolvedValueOnce([{ onboarding_completed: false }]);

    const response = await POST(onboardingRequest());

    expect(response.status).toBe(201);
    expect(mockVerifyResourceLimit).toHaveBeenCalledWith(7, "accounts");
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);

    const statements = mockTx.mock.calls.map(queryText);
    const insert = statements.find((statement) => statement.includes("INSERT INTO accounts"));
    expect(insert).toContain("ON CONFLICT (org_id, name) DO NOTHING");
    expect(insert).not.toContain("DO UPDATE");
    expect(statements).toEqual(expect.arrayContaining([
      expect.stringContaining("UPDATE organizations"),
      expect.stringContaining("UPDATE user_profile"),
    ]));
  });

  it("no inicia la transacción cuando el plan alcanzó el límite de cuentas", async () => {
    mockVerifyResourceLimit.mockResolvedValue({
      error: "Has alcanzado el límite de cuentas para tu plan",
      status: 403,
      withinLimit: false,
      needsUpgrade: true,
    });

    const response = await POST(onboardingRequest());

    expect(response.status).toBe(403);
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });
});
