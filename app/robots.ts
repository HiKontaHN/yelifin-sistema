import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hikonta.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/verify-email", "/terms", "/privacy", "/dmca"],
        disallow: [
          "/api/",
          "/dashboard",
          "/finances",
          "/sales",
          "/customers",
          "/inventory",
          "/events",
          "/reports",
          "/purchases",
          "/supplies",
          "/settings",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
