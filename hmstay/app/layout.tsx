import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "HMStay", description: "Kênh kết nối chủ homestay và broker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
