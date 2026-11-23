import type { Metadata, Viewport } from "next";
import "@seed-design/css/all.css";
import "./seed-theme.css";
import "./globals.css";
import "./safety-map.css";
import "./safety-app.css";
import "./uwat-chat.css";

export const metadata: Metadata = {
  title: "G-ROAD | 강원 도로 안전 제보 지도",
  description: "위험지역, 아차!지역, 단순주의지역을 함께 알리는 시민 제보 지도",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "G-ROAD", statusBarStyle: "black-translucent" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#101638" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" data-seed data-seed-color-mode="light-only"><body>{children}</body></html>;
}
