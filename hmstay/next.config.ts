import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "sharp", "@node-rs/argon2"],
};

export default nextConfig;
