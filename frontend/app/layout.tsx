import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google"; // Adjusted to keep existing imports valid or assumed valid
import "./globals.css";
import dynamic from "next/dynamic";

const TopBar = dynamic(() => import("./components/TopBar"), { ssr: false });

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-background">
          <TopBar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
