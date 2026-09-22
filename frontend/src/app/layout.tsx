import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resonance — Self-Hosted Music",
  description: "Self-hosted Spotify-style streaming",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
