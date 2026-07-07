import type { Metadata } from "next";
import "./globals.css";

// Noto Sans Thai is self-hosted via @font-face rules in globals.css, not next/font/google —
// the Docker build environment can't always reach fonts.googleapis.com, which made `next build`
// fail outright. body's font-family stack in globals.css already references it by name.

export const metadata: Metadata = {
  title: "AI Content Pipeline",
  description: "ระบบผลิตวิดีโอสั้นด้วย AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
