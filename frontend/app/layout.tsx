import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google"; // Adjusted to keep existing imports valid or assumed valid
import "./globals.css";
import dynamic from "next/dynamic";

const TopBar = dynamic(() => import("./components/TopBar"), { ssr: false });
const PwaSetup = dynamic(() => import("./components/PwaSetup"), { ssr: false });

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Installable app (PWA): name, icons and colours for phones and desktop.
export const metadata: Metadata = {
  title: "Flexit տերմինալ",
  applicationName: "Flexit",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Flexit",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#00613C",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hy" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-background">
          <TopBar />
          <main>{children}</main>
        </div>
        <PwaSetup />
      </body>
    </html>
  );
}
