import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow the dev server to accept requests from other machines on the local
  // network (e.g. 192.168.0.x). Without this, Next.js 16+ blocks cross-origin
  // requests to dev endpoints (CSRF protection) so login POST fails.
  allowedDevOrigins: ['192.168.0.*'],

  // Prevent Next.js from bundling native Node.js modules — they must be loaded
  // at runtime from node_modules (not bundled by webpack/turbopack).
  serverExternalPackages: [
    'better-sqlite3',
    '@modelcontextprotocol/sdk',
    'simple-git',
    'langfuse',
    '@huggingface/transformers',
  ],

  turbopack: {
    ignoreIssue: [
      {
        // `lib/installer.ts` clones git repos and runs `npm install` inside
        // runtime-computed directories. Turbopack's Node File Tracer cannot
        // statically resolve those dynamic `path.join` / `fs` operations, so it
        // conservatively traces the whole project and emits this benign warning.
        // The build succeeds and the output is correct; this suppresses the noise.
        path: /next\.config\.ts/,
        title: 'Encountered unexpected file in NFT list',
      },
    ],
  },
};

export default nextConfig;
