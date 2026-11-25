import { NextRequest } from "next/server";
import { POST } from "@/app/api/upload/route";
import { sharedRateLimit } from "@/lib/rate-limit";

const mockSave = jest.fn(async () => {});
const mockMakePublic = jest.fn(async () => {});

jest.mock("@/lib/auth", () => ({
  verifyAuth: jest.fn(async () => ({ data: { userId: 7, firebaseUid: "user-7" } })),
  isAuthSuccess: jest.fn(() => true),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

jest.mock("@/lib/firebase-admin", () => ({
  adminStorage: {
    bucket: () => ({
      name: "test-bucket",
      file: () => ({ save: mockSave, makePublic: mockMakePublic }),
    }),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  sharedRateLimit: jest.fn(),
}));

test("permite diez intentos por usuario en una ventana de un minuto", async () => {
  let attempts = 0;
  const limit = jest.mocked(sharedRateLimit);
  limit.mockImplementation(async () => {
    attempts += 1;
    return { allowed: attempts <= 10, remaining: Math.max(0, 10 - attempts), retryAfterSec: 60 };
  });

  for (let index = 0; index < 11; index++) {
    const body = new FormData();
    body.set("file", new Blob(["imagen"], { type: "image/png" }), "producto.png");
    body.set("kind", "product");
    const response = await POST(new NextRequest("http://localhost/api/upload", { method: "POST", body }));
    expect(response.status).toBe(index < 10 ? 200 : 429);
  }

  expect(limit).toHaveBeenCalledTimes(11);
  expect(limit).toHaveBeenLastCalledWith("upload:minute:7", 10, 60_000);
  expect(mockSave).toHaveBeenCalledTimes(10);
});
