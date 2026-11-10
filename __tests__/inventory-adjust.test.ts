const mockSql = jest.fn();
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
  requireFeature: jest.fn(async () => null),
  requireModule: jest.fn(async () => null),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

jest.mock("@/lib/warehouses", () => ({
  resolveWarehouseId: jest.fn(async () => ({ warehouseId: 3, error: null })),
}));

jest.mock("@/lib/db-transaction", () => ({
  withTransaction: jest.fn(async (callback: (tx: typeof mockTransactionSql) => unknown) =>
    callback(mockTransactionSql),
  ),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/inventory/adjust/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/inventory/adjust", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product_id: 10,
    type: "in",
    quantity: 2,
    unit_cost: 25,
    ...overrides,
  };
}

function insertedMovementNotes() {
  const movementCall = mockTransactionSql.mock.calls.find(([strings]) =>
    (strings as TemplateStringsArray).join(" ").includes("INSERT INTO inventory_movements"),
  );
  expect(movementCall).toBeDefined();
  const values = movementCall!.slice(1);
  return values[values.length - 2];
}

describe("POST /api/inventory/adjust", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSql.mockResolvedValue([{ id: 10, is_service: false }]);
    mockTransactionSql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();
      if (query.includes("INSERT INTO inventory_batches")) return [{ id: 41 }];
      return [];
    });
  });

  it.each([
    ["sin notes", undefined],
    ["con notes vacío", ""],
    ["con notes de solo espacios", "   "],
  ])("acepta un ajuste %s y guarda null", async (_case, notes) => {
    const body = validBody();
    if (notes !== undefined) body.notes = notes;

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(201);
    expect(insertedMovementNotes()).toBeNull();
  });

  it("recorta y guarda el motivo cuando viene texto", async () => {
    const response = await POST(makeRequest(validBody({ notes: "  Corrección de conteo  " })));

    expect(response.status).toBe(201);
    expect(insertedMovementNotes()).toBe("Corrección de conteo");
  });

  it.each([
    ["producto", { product_id: undefined }, "El producto es requerido"],
    ["tipo", { type: undefined }, "El tipo debe ser 'in' o 'out'"],
    ["cantidad", { quantity: 0 }, "La cantidad debe ser al menos 1"],
  ])("mantiene la validación de %s", async (_field, overrides, message) => {
    const response = await POST(makeRequest(validBody(overrides)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(mockTransactionSql).not.toHaveBeenCalled();
  });
});
