import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.cursor.com", "*.cursor.sh"],
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
  },
  devIndicators: false,
};

export default nextConfig;
