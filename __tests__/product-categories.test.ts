import { NextRequest } from "next/server";

const mockSql = jest.fn();
const mockRequireModule = jest.fn();

jest.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));
jest.mock("@/lib/auth", () => ({
  verifyAuthAndSubscription: jest.fn(async () => ({ data: { orgId: 7, userId: 11 } })),
  isAuthSuccess: () => true,
  requireFeature: jest.fn(async () => null),
  requireModule: (...args: unknown[]) => mockRequireModule(...args),
  verifyResourceLimit: jest.fn(async () => ({ withinLimit: true })),
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
}));
jest.mock("@/lib/sku", () => ({
  isProductSkuAvailable: jest.fn(async () => true),
}));

import { POST as createCategory } from "@/app/api/product-categories/route";
import { DELETE as deleteCategory } from "@/app/api/product-categories/[id]/route";
import { POST as createProduct } from "@/app/api/products/route";
import { PATCH as updateProduct } from "@/app/api/products/[id]/route";

const categoryParams = { params: Promise.resolve({ id: "14" }) };
const productParams = { params: Promise.resolve({ id: "27" }) };
const foreignKeyError = { code: "23503", constraint: "products_category_org_fk" };

function request(path: string, method: string, body?: object) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

describe("categorías por organización", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockRequireModule.mockReset().mockResolvedValue(null);
  });

  it("registra la categoría con la organización autenticada y limpia el nombre", async () => {
    mockSql.mockResolvedValueOnce([{ id: 14, name: "Ropa" }]);

    const result = await createCategory(request("/api/product-categories", "POST", { name: " Ropa ", org_id: 22 }));

    expect(result.status).toBe(201);
    expect(mockRequireModule).toHaveBeenCalledWith(expect.objectContaining({ orgId: 7 }), "ADMIN", "canEdit", "CATEGORIES");
    expect(mockSql.mock.calls[0].slice(1)).toEqual([7, "Ropa"]);
  });

  it("responde con un conflicto si el nombre ya existe en el negocio", async () => {
    mockSql.mockResolvedValueOnce([]);
    expect((await createCategory(request("/api/product-categories", "POST", { name: "ropa" }))).status).toBe(409);
  });

  it("rechaza la asignación a una categoría ausente o de otro negocio", async () => {
    mockSql.mockRejectedValueOnce(foreignKeyError);
    const result = await createProduct(request("/api/products", "POST", {
      name: "Camisa", price: 100, sku: "CAM-01", product_category_id: 14,
    }));

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({ error: "La categoría no existe en este negocio" });
    expect(mockSql.mock.calls[0][1]).toBe(7);
    expect(mockSql.mock.calls[0].at(-1)).toBe(14);
  });

  it.each([
    { payload: {}, changesCategory: false, categoryId: null },
    { payload: { product_category_id: null }, changesCategory: true, categoryId: null },
    { payload: { product_category_id: 14 }, changesCategory: true, categoryId: 14 },
  ])("distingue explícitamente las actualizaciones de categoría: %o", async ({ payload, changesCategory, categoryId }) => {
    mockSql.mockResolvedValueOnce([{ id: 27 }]).mockResolvedValueOnce([{ id: 27 }]);

    const result = await updateProduct(request("/api/products/27", "PATCH", payload), productParams);

    expect(result.status).toBe(200);
    expect(mockSql.mock.calls[1].slice(-5)).toEqual([changesCategory, categoryId, 11, 27, 7]);
  });

  it("impide eliminar una categoría que está en uso", async () => {
    mockSql.mockRejectedValueOnce(foreignKeyError);

    const result = await deleteCategory(request("/api/product-categories/14", "DELETE"), categoryParams);

    expect(result.status).toBe(409);
    expect(mockSql.mock.calls[0].slice(1)).toEqual([7, 14]);
  });
});
