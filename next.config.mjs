import { fileURLToPath } from "node:url"

const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "")
// us.i.posthog.com -> us-assets.i.posthog.com, eu.i... -> eu-assets.i...; otro host: us-assets.
const derivedAssetsHost = posthogHost.replace(/^(https?:\/\/)(us|eu)\.i\./, "$1$2-assets.i.")
const posthogAssetsHost = /^https?:\/\/(us|eu)-assets\.i\./.test(derivedAssetsHost)
  ? derivedAssetsHost
  : "https://us-assets.i.posthog.com"

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${posthogAssetsHost}/static/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${posthogHost}/:path*`,
      },
    ]
  },
  skipTrailingSlashRedirect: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@napi-rs/canvas"],
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
}

export default nextConfig
