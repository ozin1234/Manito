import type { Metadata, Viewport } from "next";
import "@seed-design/css/all.css";
import "./seed-theme.css";
import "./globals.css";
import "./safety-map.css";
import "./safety-app.css";
import "./uwat-chat.css";
import "./public-complaints.css";
import "./neighborhood.css";

export const metadata: Metadata = {
  title: "K-ROAD | 강원 생활불편·도로·안전재난",
  description: "생활불편·도로·안전재난 공개 민원과 우왓 현장 기록을 함께 확인합니다.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "K-ROAD", statusBarStyle: "black-translucent" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f7fb" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" data-seed data-seed-color-mode="light-only"><body>{children}</body></html>;
}
