import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    domains: ["localhost", "minio"],
  },
};

export default nextConfig;
