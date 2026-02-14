import type { NextConfig } from "next";

// Note: Environment variables are now loaded and decrypted by dotenvx
// Run with: dotenvx run -- next dev
// This is handled automatically by the npm scripts

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Convex functions are type-checked separately via `npx convex typecheck`.
    // The convex/ directory imports packages (@anthropic-ai/sdk, @modelcontextprotocol/sdk)
    // that are not part of the web workspace, so Next.js's built-in type check would fail.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
