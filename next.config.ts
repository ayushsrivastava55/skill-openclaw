import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    webpackBuildWorker: false
  }
};

export default nextConfig;
