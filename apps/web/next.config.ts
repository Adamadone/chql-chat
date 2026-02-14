import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Convex functions are type-checked separately; the convex/ directory
    // imports packages outside the web workspace so Next.js tsc would fail.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
