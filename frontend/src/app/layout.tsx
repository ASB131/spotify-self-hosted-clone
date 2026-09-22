import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { RuntimeConfig } from "@/components/RuntimeConfig";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Resonance — Self-Hosted Music",
  description: "Self-hosted Spotify-style streaming",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className={sans.className}>
        <RuntimeConfig />
        {children}
      </body>
    </html>
  );
}
