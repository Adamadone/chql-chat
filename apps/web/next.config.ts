import type { NextConfig } from "next";

// Note: Environment variables are now loaded and decrypted by dotenvx
// Run with: dotenvx run -- next dev
// This is handled automatically by the npm scripts

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
