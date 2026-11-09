const mockSql = jest.fn();
const mockTx = jest.fn();
const mockWithTransaction = jest.fn(
  async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx),
);
const mockVerifyResourceLimit = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
  neonConfig: {},
  Pool: jest.fn(),
}));

jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {},
}));

jest.mock("@/lib/db-transaction", () => ({
  withTransaction: mockWithTransaction,
}));

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual("@/lib/auth");
  return {
    ...actual,
    verifyAuthAndSubscription: jest.fn(async () => ({
      error: null,
      status: 200,
      data: { userId: 11, orgId: 7, isOwner: true },
    })),
    isAuthSuccess: jest.fn(() => true),
    requireFeature: jest.fn(async () => null),
    requireModule: jest.fn(async () => null),
    verifyResourceLimit: (...args: unknown[]) => mockVerifyResourceLimit(...args),
  };
});

import { NextRequest } from "next/server";
import { ensureOrgExists } from "@/lib/auth";
import { POST as createWarehouse } from "@/app/api/organization/warehouses/route";

function queryText(call: unknown[]) {
  return (call[0] as TemplateStringsArray).join(" ").replace(/\s+/g, " ").trim();
}

describe("bodega predeterminada", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.mockReset();
    mockTx.mockResolvedValue([]);
    mockVerifyResourceLimit.mockResolvedValue({ withinLimit: true });
  });

  it("crea Local Principal en la misma transacción al crear la organización", async () => {
    mockTx.mockImplementation(async (strings: TemplateStringsArray) => {
      const statement = strings.join(" ").replace(/\s+/g, " ");
      if (statement.includes("FROM organization_members")) return [];
      if (statement.includes("INSERT INTO organizations")) return [{ id: 7 }];
      if (statement.includes("INSERT INTO org_roles")) return [{ id: 3, name: "Dueño" }];
      if (statement.includes("FROM subscription_plans")) return [{ id: 2 }];
      return [];
    });

    await expect(ensureOrgExists(11, "Mi negocio")).resolves.toEqual({
      orgId: 7,
      roleId: 3,
      roleName: "Dueño",
    });

    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    const warehouseInsert = mockTx.mock.calls
      .map(queryText)
      .find((statement) => statement.includes("INSERT INTO warehouses"));
    expect(warehouseInsert).toContain("'Local Principal', TRUE, TRUE");
    expect(warehouseInsert).toContain("WHERE NOT EXISTS");
  });

  it("no intenta crear una bodega si el usuario ya tiene membership", async () => {
    mockTx.mockResolvedValueOnce([{ org_id: 7, role_id: 3, role_name: "Dueño" }]);

    await ensureOrgExists(11, "Mi negocio");

    expect(mockTx.mock.calls.map(queryText)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("INSERT INTO warehouses")]),
    );
  });

  it("marca como default la bodega creada solo cuando la organización no tiene una", async () => {
    mockTx.mockImplementation(async (strings: TemplateStringsArray) => {
      const statement = strings.join(" ").replace(/\s+/g, " ");
      if (!statement.includes("INSERT INTO warehouses")) return [];
      return [{
        id: 9,
        name: "Sucursal",
        is_active: true,
        is_default: true,
        created_at: new Date().toISOString(),
      }];
    });

    const response = await createWarehouse(new NextRequest(
      "http://localhost/api/organization/warehouses",
      { method: "POST", body: JSON.stringify({ name: "Sucursal" }) },
    ));

    expect(response.status).toBe(201);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    const statements = mockTx.mock.calls.map(queryText);
    expect(statements[0]).toContain("FOR UPDATE");
    const insert = statements.find((statement) => statement.includes("INSERT INTO warehouses"));
    expect(insert).toContain("INSERT INTO warehouses (org_id, name, is_default");
    expect(insert).toContain("NOT EXISTS");
    expect(insert).toContain("is_default = TRUE");
  });
});
