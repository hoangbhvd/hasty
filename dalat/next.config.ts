import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lưu cache biên dịch Turbopack vào .next/cache (Dockerfile giữ thư mục này giữa các lần build) → build lại sau khi sửa ít file nhanh hơn nhiều
  experimental: { turbopackFileSystemCacheForBuild: true },
  // Chế độ 2 của Booking Confirmation: rasterize PDF → PNG dùng binary gốc (canvas), không để bundler gộp
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "@napi-rs/canvas"],
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" }, // không cho nhúng app vào iframe (chống clickjacking)
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ];
    return [
      { source: "/(.*)", headers: security },
      // Service worker phải luôn được kiểm tra bản mới
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
