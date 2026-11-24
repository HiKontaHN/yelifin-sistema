import { NextRequest } from "next/server";

const mockTransaction = jest.fn();
const mockSql = Object.assign(jest.fn(), { transaction: mockTransaction });
const mockVerifyAuth = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

jest.mock("@/lib/auth", () => ({
  verifyAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  isAuthSuccess: (auth: { data?: unknown }) => Boolean(auth.data),
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
}));

import { GET, PUT } from "@/app/api/organization/social-links/route";

const endpoint = "http://localhost/api/organization/social-links";
const emptyLinks = { facebook: null, instagram: null, whatsapp: null };

function saveRequest(input: object) {
  return new NextRequest(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

describe("redes sociales del negocio", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockVerifyAuth.mockResolvedValue({ data: { orgId: 7, isOwner: true } });
    mockSql.mockResolvedValue([]);
    mockTransaction.mockResolvedValue([]);
  });

  it("lee las redes de la organización activa y devuelve null para las redes sin enlace", async () => {
    mockSql.mockResolvedValueOnce([{ platform: "instagram", url: "https://instagram.com/tienda" }]);

    const response = await GET(new NextRequest(endpoint));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { ...emptyLinks, instagram: "https://instagram.com/tienda" },
    });
    expect(mockSql.mock.calls[0].slice(1)).toEqual([7]);
  });

  it("limita la consulta y los cambios al dueño autenticado", async () => {
    mockVerifyAuth.mockResolvedValue({ data: { orgId: 7, isOwner: false } });

    expect((await GET(new NextRequest(endpoint))).status).toBe(403);
    expect((await PUT(saveRequest(emptyLinks))).status).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("normaliza los enlaces y limita altas y bajas al negocio de la sesión", async () => {
    const response = await PUT(saveRequest({
      facebook: " facebook.com/tienda ",
      instagram: "",
      whatsapp: "+504 9999-9999",
      org_id: 21,
    }));
    const facebook = "https://facebook.com/tienda";
    const whatsapp = "https://wa.me/50499999999";

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { facebook, instagram: null, whatsapp } });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockSql.mock.calls[0].slice(1)).toEqual([7]);
    expect(mockSql.mock.calls[1].slice(1)).toEqual([facebook, null, whatsapp, 7, 7]);
  });

  it.each([
    { facebook: "https://facebook.com.example.org/tienda" },
    { instagram: "https://instagram.com@otro.example/tienda" },
    { instagram: "javascript:alert(1)" },
    { whatsapp: "+504" },
    { whatsapp: "https://wa.me/no-es-numero" },
  ])("rechaza una red inválida sin guardar cambios: %o", async (invalid) => {
    const response = await PUT(saveRequest({ ...emptyLinks, ...invalid }));

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("acepta un enlace directo de WhatsApp Business", async () => {
    const whatsapp = "https://wa.me/message/CODIGO123";
    const response = await PUT(saveRequest({ ...emptyLinks, whatsapp }));

    await expect(response.json()).resolves.toEqual({ data: { ...emptyLinks, whatsapp } });
  });
});
