import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyUnsubscribeToken } from "@/lib/marketing-unsubscribe";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let token = "";

  if (contentType.includes("application/json")) {
    token = String((await request.json().catch(() => ({}))).token ?? "");
  } else {
    const formData = await request.formData().catch(() => null);
    token = String(formData?.get("token") ?? request.nextUrl.searchParams.get("token") ?? "");
  }

  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return NextResponse.json({ error: "Enlace de baja inválido o vencido" }, { status: 400 });
  }

  await sql`
    INSERT INTO marketing_email_preferences (email, opted_out_at, updated_at)
    VALUES (${email}, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE
      SET opted_out_at = NOW(), updated_at = NOW()
  `;

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    return NextResponse.redirect(new URL("/unsubscribe?success=1", request.url), 303);
  }
  return NextResponse.json({ success: true });
}
