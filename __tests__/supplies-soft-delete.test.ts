const mockSql = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/auth", () => ({
  verifyAuth: jest.fn(async () => ({
    error: null,
    status: 200,
    data: { userId: 11, orgId: 7 },
  })),
  isAuthSuccess: jest.fn(() => true),
  requireModule: jest.fn(async () => null),
  verifyResourceLimit: jest.fn(async () => ({ withinLimit: true })),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

import { NextRequest, NextResponse } from "next/server";
import { DELETE } from "@/app/api/supplies/[id]/route";
import { GET } from "@/app/api/supplies/route";
import { requireModule } from "@/lib/auth";

function queryText(call: unknown[]) {
  return (call[0] as TemplateStringsArray).join(" ").replace(/\s+/g, " ").trim();
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/supplies/42", { method: "DELETE" });
}

const routeParams = { params: Promise.resolve({ id: "42" }) };

describe("soft delete de suministros", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("desactiva el suministro sin borrar el registro ni consultar su historial", async () => {
    mockSql.mockResolvedValueOnce([{ id: 42 }]);

    const response = await DELETE(deleteRequest(), routeParams);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "Suministro eliminado" });
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(queryText(mockSql.mock.calls[0])).toBe(
      "UPDATE supplies SET is_active = FALSE, updated_by = WHERE id = AND org_id = AND is_active = TRUE RETURNING id",
    );
    expect(mockSql.mock.calls[0].slice(1)).toEqual([11, 42, 7]);
  });

  it("responde 404 si el suministro ya no está activo o no existe", async () => {
    mockSql.mockResolvedValueOnce([]);

    const response = await DELETE(deleteRequest(), routeParams);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Suministro no encontrado" });
  });

  it("requiere permiso de eliminación en Suministros antes de desactivar", async () => {
    jest.mocked(requireModule).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));

    const response = await DELETE(deleteRequest(), routeParams);

    expect(response.status).toBe(403);
    expect(requireModule).toHaveBeenCalledWith(expect.anything(), "INVENTORY", "canDelete", "SUPPLIES");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("filtra los inactivos en el conteo y en el listado", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: 1, name: "Caja" }]);

    const response = await GET(new NextRequest("http://localhost/api/supplies"));

    expect(response.status).toBe(200);
    const statements = mockSql.mock.calls.map(queryText);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("WHERE org_id = AND is_active = TRUE");
    expect(statements[1]).toContain("WHERE org_id = AND is_active = TRUE");
  });
});
