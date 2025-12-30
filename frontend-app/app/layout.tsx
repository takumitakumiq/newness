import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MATSU - 洛星文化祭チケットシステム",
  description: "洛星文化祭の入場チケット予約・管理システム",
  keywords: ["文化祭", "チケット", "洛星", "予約"],
  authors: [{ name: "MATSU Team" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className={`${inter.className} festival-gradient min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
