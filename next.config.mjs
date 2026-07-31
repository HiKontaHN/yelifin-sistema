import { fileURLToPath } from "node:url"

/** @type {import('next').NextConfig} */
const nextConfig = {
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
