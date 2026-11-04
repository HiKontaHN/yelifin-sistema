import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockSql = jest.fn();
const mockRequireFeature = jest.fn();

const authSuccess = {
  error: null,
  status: 200,
  data: {
    userId: 1,
    orgId: 7,
    roleId: 1,
    roleName: "Dueño",
    isOwner: true,
    timezone: "America/Tegucigalpa",
  },
};

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/auth", () => ({
  verifyAuth: jest.fn(async () => authSuccess),
  verifyAuthAndSubscription: jest.fn(async () => authSuccess),
  isAuthSuccess: jest.fn(() => true),
  requireFeature: (...args: unknown[]) => mockRequireFeature(...args),
  requireModule: jest.fn(async () => null),
  getOrgTimezone: jest.fn(async () => "America/Tegucigalpa"),
  createErrorResponse: jest.fn((message: string, status: number, needsUpgrade = false) =>
    Response.json({ error: message, needs_upgrade: needsUpgrade }, { status }),
  ),
}));

import { NextRequest } from "next/server";
import { GET as getMovements } from "@/app/api/inventory/movements/route";
import {
  GET as getCategories,
  POST as createCategory,
} from "@/app/api/transaction-categories/route";
import {
  PATCH as updateCategory,
  DELETE as deleteCategory,
} from "@/app/api/transaction-categories/[id]/route";

const denied = Response.json(
  { error: "Función no incluida", needs_upgrade: true },
  { status: 403 },
);

describe("features de movimientos y categorías personalizadas", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockRequireFeature.mockReset();
  });

  it("bloquea consultar movimientos sin inventory.movements", async () => {
    mockRequireFeature.mockResolvedValue(denied);

    const response = await getMovements(new NextRequest("http://localhost/api/inventory/movements"));

    expect(response.status).toBe(403);
    expect(mockRequireFeature).toHaveBeenCalledWith(7, "inventory.movements");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("mantiene legibles las categorías con finances.transactions", async () => {
    mockRequireFeature.mockImplementation(async (_orgId: number, feature: string) =>
      feature === "finances.custom_categories" ? denied : null,
    );
    mockSql.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);

    const response = await getCategories(new NextRequest("http://localhost/api/transaction-categories"));

    expect(response.status).toBe(200);
    expect(mockRequireFeature).toHaveBeenCalledWith(7, "finances.transactions");
    expect(mockRequireFeature).not.toHaveBeenCalledWith(7, "finances.custom_categories");
  });

  it("bloquea crear, editar y borrar sin finances.custom_categories", async () => {
    mockRequireFeature.mockResolvedValue(denied);

    const createResponse = await createCategory(new NextRequest(
      "http://localhost/api/transaction-categories",
      { method: "POST", body: JSON.stringify({ name: "Otra", type: "EXPENSE" }) },
    ));
    const updateResponse = await updateCategory(new NextRequest(
      "http://localhost/api/transaction-categories/3",
      { method: "PATCH", body: JSON.stringify({ name: "Editada" }) },
    ), { params: Promise.resolve({ id: "3" }) });
    const deleteResponse = await deleteCategory(new NextRequest(
      "http://localhost/api/transaction-categories/3",
      { method: "DELETE" },
    ), { params: Promise.resolve({ id: "3" }) });

    expect(createResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(mockRequireFeature).toHaveBeenCalledTimes(3);
    expect(mockRequireFeature).toHaveBeenNthCalledWith(1, 7, "finances.custom_categories");
    expect(mockRequireFeature).toHaveBeenNthCalledWith(2, 7, "finances.custom_categories");
    expect(mockRequireFeature).toHaveBeenNthCalledWith(3, 7, "finances.custom_categories");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("asigna ambas features a los planes decididos y las apaga en free/trial", () => {
    const sql = readFileSync(join(
      process.cwd(),
      "database", "migrations", "fix-subscriptions",
      "04-inventory-movements-categories-features.sql",
    ), "utf8");

    expect(sql).toContain("'inventory.movements'");
    expect(sql).toContain("'finances.custom_categories'");
    expect(sql).toContain("p.slug IN ('basico', 'pro', 'original', 'admin')");
    expect(sql).toContain("p.slug IN ('free', 'trial')");
    expect(sql).toContain("ON CONFLICT (plan_id, feature_id) DO UPDATE");
  });

  it("inventory.movements bloquea solo el historial (GET), no las rutas que cargan stock", () => {
    const gate = 'requireFeature(auth.data.orgId, "inventory.movements")';
    const read = (route: string) => readFileSync(join(process.cwd(), route), "utf8");

    for (const route of [
      "app/api/inventory/movements/route.ts",
      "app/api/inventory/movements/periods/route.ts",
    ]) {
      expect(read(route)).toContain(gate);
    }

    const transfers = read("app/api/organization/warehouses/transfers/route.ts");
    const [getHandler, postHandler] = transfers.split("export async function POST");
    expect(getHandler).toContain(gate);
    expect(postHandler).not.toContain("inventory.movements");

    for (const route of [
      "app/api/inventory/existing/route.ts",
      "app/api/inventory/adjust/route.ts",
      "app/api/inventory/import/route.ts",
    ]) {
      expect(read(route)).not.toContain("inventory.movements");
    }
  });
});
