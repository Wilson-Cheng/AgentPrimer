import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to accept requests from other machines on the local
  // network (e.g. 192.168.0.x). Without this, Next.js 16+ blocks cross-origin
  // requests to dev endpoints (CSRF protection) so login POST fails.
  allowedDevOrigins: ['192.168.0.*'],

  // Prevent Next.js from bundling native Node.js modules — they must be loaded
  // at runtime from node_modules (not bundled by webpack/turbopack).
  serverExternalPackages: [
    "better-sqlite3",
    "@modelcontextprotocol/sdk",
    "simple-git",
    "langfuse",
  ],
};

export default nextConfig;

