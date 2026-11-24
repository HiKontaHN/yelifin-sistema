import { NextRequest } from "next/server";

const mockFindOrganization = jest.fn();
const mockStock = jest.fn();
const mockAttach = jest.fn();
const mockUpgrade = jest.fn();

jest.mock("@vercel/functions", () => ({
  upgradeWebSocket: (...args: unknown[]) => mockUpgrade(...args),
}));
jest.mock("@/lib/catalog-stock-realtime", () => ({
  attachCatalogStockSocket: (...args: unknown[]) => mockAttach(...args),
}));
jest.mock("@/lib/public-catalog-stock", () => ({
  findPublicCatalogOrganization: (...args: unknown[]) => mockFindOrganization(...args),
  readPublicCatalogStock: (...args: unknown[]) => mockStock(...args),
}));

import { GET } from "@/app/api/catalog/[catalogId]/stock/route";

const catalogId = "8bd6f0d1-9ab8-4d03-9a85-1a82b18145a1";
const id = "8bd6f0d1-9ab8-4d03-9a85-1a82b18145a2";

function request(token = catalogId, headers?: HeadersInit) {
  return GET(
    new NextRequest(`http://localhost/api/catalog/${token}/stock`, { headers }),
    { params: Promise.resolve({ catalogId: token }) },
  );
}

describe("inventario consultable por enlace público", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("devuelve solo la disponibilidad y evita almacenarla en caché", async () => {
    mockStock.mockResolvedValue({ [id]: 7 });
    const response = await request();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ type: "stock", stock: { [id]: 7 } });
    expect(mockStock).toHaveBeenCalledWith(catalogId);
  });

  it("rechaza identificadores secuenciales y enlaces revocados", async () => {
    expect((await request("42")).status).toBe(404);
    expect(mockStock).not.toHaveBeenCalled();
    mockFindOrganization.mockResolvedValue(null);
    expect((await request(catalogId, { upgrade: "websocket" })).status).toBe(404);
    expect(mockUpgrade).not.toHaveBeenCalled();
  });

  it("limita la suscripción al negocio del enlace", async () => {
    mockFindOrganization.mockResolvedValue("17");
    const socket = {};
    mockUpgrade.mockImplementation(async (connect) => {
      connect(socket);
      return new Response(null, { status: 204 });
    });

    expect((await request(catalogId, { upgrade: "websocket", origin: "http://localhost" })).status).toBe(204);
    expect(mockAttach).toHaveBeenCalledWith(socket, catalogId, "17");
  });
});
