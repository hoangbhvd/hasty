import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Mặc định 1MB; ảnh điện thoại nặng vài MB, cho phép nhiều ảnh mỗi lần tải lên
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  serverExternalPackages: ["pg", "sharp", "@node-rs/argon2"],
};

export default nextConfig;
