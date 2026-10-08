import type { NextRequest } from "next/server";

/** Los túneles de desarrollo pueden tener un origen distinto al servidor local. */
export function hasValidRequestOrigin(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;

  return request.headers.get("origin") === request.nextUrl.origin;
}

/** CORS abierto únicamente en `next dev`; producción conserva su política. */
export function withDevelopmentCors<T extends Response>(
  request: NextRequest,
  response: T,
): T {
  if (process.env.NODE_ENV !== "development") return response;

  const origin = request.headers.get("origin");
  if (!origin) return response;

  // Reflejar el origen (en vez de '*') permite usar cookies de sesión.
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.append("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      request.headers.get("access-control-request-headers") ??
        "Content-Type, Authorization",
    );
    response.headers.set("Access-Control-Max-Age", "600");
    response.headers.append("Vary", "Access-Control-Request-Headers");
  }

  return response;
}
