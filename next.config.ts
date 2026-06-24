import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["@libsql/client", "libsql", "sharp"],
};

export default nextConfig;
