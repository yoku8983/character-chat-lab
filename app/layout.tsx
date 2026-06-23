import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Character Chat Lab",
  description: "AIキャラクターなりきりチャット＆口調変換",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
