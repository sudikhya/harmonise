import type { NextConfig } from "next";

const staticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  // Dual target: server mode by default (API routes + SQLite need Node), or a
  // GitHub Pages static export when NEXT_STATIC_EXPORT=1 (API routes are then
  // excluded from the build and server features degrade honestly in the UI).
  ...(staticExport ? { output: "export" as const, trailingSlash: true } : {}),
  basePath: process.env.NEXT_BASE_PATH ?? "",
  // Keep development-only Next.js chrome out of prototype screenshots.
  devIndicators: false,
  // sql.js loads its WASM binary from disk at runtime; never bundle it.
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
