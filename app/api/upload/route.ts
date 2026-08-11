// app/api/upload/route.ts
import { NextRequest } from "next/server";
import { adminStorage } from "@/lib/firebase-admin";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const MAX_BYTES   = 2 * 1024 * 1024; // 2 MB
const ALLOWED     = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
};

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { userId } = auth.data;

    // 20 subidas por usuario cada hora — evita abuso de storage/egress.
    const { allowed, retryAfterSec } = rateLimit(`upload:${userId}`, 20, 60 * 60 * 1000);
    if (!allowed) {
      return createErrorResponse(
        "Demasiadas subidas. Intenta de nuevo más tarde.",
        429
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file)
      return createErrorResponse("No se recibió ningún archivo", 400);
    if (!ALLOWED.includes(file.type))
      return createErrorResponse("Tipo no permitido. Usá JPG, PNG, WebP o GIF.", 400);
    if (file.size > MAX_BYTES)
      return createErrorResponse("El archivo no puede superar 2 MB.", 400);

    const ext      = EXT_MAP[file.type] ?? "jpg";
    const filePath = `business-logos/${userId}/${Date.now()}.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    const bucket      = adminStorage.bucket();
    const storageFile = bucket.file(filePath);

    await storageFile.save(buffer, { metadata: { contentType: file.type } });
    await storageFile.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    return Response.json({ url }, { status: 200 });

  } catch (error) {
    console.error("POST /api/upload:", error);
    return createErrorResponse("Error al subir el archivo", 500);
  }
}
