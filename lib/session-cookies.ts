import type { NextResponse } from "next/server";

export function clearSessionCookies(response: NextResponse): NextResponse {
  for (const name of ["hikonta_auth", "hikonta_nav", "token", "hikonta_session"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
