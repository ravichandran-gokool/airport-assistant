import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the knowledge-base markdown files are bundled with the
  // serverless function on Vercel (they're read with fs at runtime).
  outputFileTracingIncludes: {
    "/api/chat": ["./data/**/*"],
  },
};

export default nextConfig;
