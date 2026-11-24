import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, Be_Vietnam_Pro, Playfair_Display, Montserrat } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

// Hai font của Booking Confirmation (VOUCHER_SPEC font_family)
const beVietnam = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-be-vietnam", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin", "vietnamese"], weight: ["300", "400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-montserrat", display: "swap" }); // mẫu Cottown
const playfair = Playfair_Display({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-playfair", display: "swap" });

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DalatStay — Kết nối Chủ Homestay & Broker Đà Lạt",
  description: "Quản lý lịch phòng, giữ phòng nhanh và đối soát hoa hồng homestay Đà Lạt",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ĐL Homestay", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${plusJakarta.variable} ${jetbrainsMono.variable} ${beVietnam.variable} ${playfair.variable} ${montserrat.variable}`}>
      <body className="min-h-screen bg-background text-foreground">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}