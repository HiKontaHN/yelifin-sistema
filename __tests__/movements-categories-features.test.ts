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
  DELETE as bulkDeleteCategories,
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
    const bulkDeleteResponse = await bulkDeleteCategories(new NextRequest(
      "http://localhost/api/transaction-categories",
      { method: "DELETE", body: JSON.stringify({ ids: [3, 4] }) },
    ));

    expect(createResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(bulkDeleteResponse.status).toBe(403);
    expect(mockRequireFeature).toHaveBeenCalledTimes(4);
    expect(mockRequireFeature).toHaveBeenNthCalledWith(1, 7, "finances.custom_categories");
    expect(mockRequireFeature).toHaveBeenNthCalledWith(2, 7, "finances.custom_categories");
    expect(mockRequireFeature).toHaveBeenNthCalledWith(3, 7, "finances.custom_categories");
    expect(mockRequireFeature).toHaveBeenNthCalledWith(4, 7, "finances.custom_categories");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("desactiva varias categorías en una sola solicitud", async () => {
    mockRequireFeature.mockResolvedValue(null);
    mockSql.mockResolvedValue([{ id: 11 }, { id: 12 }]);

    const response = await bulkDeleteCategories(new NextRequest(
      "http://localhost/api/transaction-categories",
      { method: "DELETE", body: JSON.stringify({ ids: [11, 12] }) },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        { id: 11, success: true, message: "Categoría desactivada correctamente" },
        { id: 12, success: true, message: "Categoría desactivada correctamente" },
      ],
    });
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("reporta el resultado parcial sin ocultar la categoría fallida", async () => {
    mockRequireFeature.mockResolvedValue(null);
    mockSql.mockResolvedValue([{ id: 21 }, { id: 23 }]);

    const response = await bulkDeleteCategories(new NextRequest(
      "http://localhost/api/transaction-categories",
      { method: "DELETE", body: JSON.stringify({ ids: [21, 22, 23] }) },
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([
      { id: 21, success: true, message: "Categoría desactivada correctamente" },
      { id: 22, success: false, message: "Categoría no encontrada" },
      { id: 23, success: true, message: "Categoría desactivada correctamente" },
    ]);
  });

  it("limita el borrado en lote a la organización autenticada", async () => {
    mockRequireFeature.mockResolvedValue(null);
    // La base solo devuelve el ID 31; el 99 simula una categoría de otra organización.
    mockSql.mockResolvedValue([{ id: 31 }]);

    const response = await bulkDeleteCategories(new NextRequest(
      "http://localhost/api/transaction-categories",
      { method: "DELETE", body: JSON.stringify({ ids: [31, 99] }) },
    ));
    const body = await response.json();
    const [strings, ...values] = mockSql.mock.calls[0];

    expect(strings.join(" ")).toContain("AND org_id  =");
    expect(values).toContain(7);
    expect(body.results).toContainEqual({ id: 99, success: false, message: "Categoría no encontrada" });
  });

  it("usa el mismo soft-delete en el borrado individual y en lote", async () => {
    mockRequireFeature.mockResolvedValue(null);
    mockSql.mockResolvedValue([{ id: 41 }]);

    await deleteCategory(new NextRequest(
      "http://localhost/api/transaction-categories/41",
      { method: "DELETE" },
    ), { params: Promise.resolve({ id: "41" }) });
    await bulkDeleteCategories(new NextRequest(
      "http://localhost/api/transaction-categories",
      { method: "DELETE", body: JSON.stringify({ ids: [41] }) },
    ));

    const individualSql = mockSql.mock.calls[0][0].join(" ");
    const bulkSql = mockSql.mock.calls[1][0].join(" ");
    for (const statement of [individualSql, bulkSql]) {
      expect(statement).toContain("UPDATE transaction_categories SET");
      expect(statement).toContain("is_active  = FALSE");
      expect(statement).toContain("updated_by =");
      expect(statement).toContain("AND org_id  =");
      expect(statement).not.toContain("DELETE FROM transaction_categories");
    }
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
