// app/api/upload/route.ts
import { NextRequest } from "next/server";
import { adminStorage } from "@/lib/firebase-admin";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { randomUUID } from "node:crypto";

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
    const kind = formData.get("kind");

    if (!file)
      return createErrorResponse("No se recibió ningún archivo", 400);
    if (!ALLOWED.includes(file.type))
      return createErrorResponse("Tipo no permitido. Usá JPG, PNG, WebP o GIF.", 400);
    if (file.size > MAX_BYTES)
      return createErrorResponse("El archivo no puede superar 2 MB.", 400);
    if (kind !== null && !["product", "variant"].includes(String(kind)))
      return createErrorResponse("Destino de archivo no válido", 400);

    const ext      = EXT_MAP[file.type] ?? "jpg";
    const filePath = kind === "product" || kind === "variant"
      ? `products/${auth.data.firebaseUid}/${kind === "variant" ? "variants/" : ""}${randomUUID()}.${ext}`
      : `business-logos/${userId}/${Date.now()}.${ext}`;
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

export async function DELETE(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { url } = await request.json();
    if (typeof url !== "string") return createErrorResponse("URL no válida", 400);

    const parsed = new URL(url);
    if (parsed.protocol !== "https:")
      return createErrorResponse("URL de imagen no válida", 400);
    const bucket = adminStorage.bucket();
    let filePath: string;

    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match || decodeURIComponent(match[1]) !== bucket.name)
        return createErrorResponse("URL de imagen no válida", 400);
      filePath = decodeURIComponent(match[2]);
    } else if (parsed.hostname === "storage.googleapis.com") {
      const prefix = `/${bucket.name}/`;
      if (!parsed.pathname.startsWith(prefix))
        return createErrorResponse("URL de imagen no válida", 400);
      filePath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    } else {
      return createErrorResponse("URL de imagen no válida", 400);
    }

    if (!filePath.startsWith(`products/${auth.data.firebaseUid}/`))
      return createErrorResponse("No autorizado para eliminar esta imagen", 403);

    await bucket.file(filePath).delete({ ignoreNotFound: true });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/upload:", error);
    return createErrorResponse("No se pudo eliminar la imagen", 500);
  }
}
