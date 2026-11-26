"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { isAuthActionPath } from "@/lib/posthog-sanitize";

export function SiteAnalytics({ googleAnalyticsId }: { googleAnalyticsId?: string }) {
  const pathname = usePathname();
  if (isAuthActionPath(pathname)) return null;

  return (
    <>
      <Analytics />
      {googleAnalyticsId && <GoogleAnalytics gaId={googleAnalyticsId} />}
    </>
  );
}
