import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server mode: the live adviser API route (/api/advice) needs a Node runtime,
  // so the app no longer uses a static export. No trailing slash: API POSTs
  // must not pass through a redirect.
  basePath: process.env.NEXT_BASE_PATH ?? "",
  // Keep development-only Next.js chrome out of prototype screenshots.
  devIndicators: false,
  // sql.js loads its WASM binary from disk at runtime; never bundle it.
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
