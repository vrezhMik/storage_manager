"use client";

import { useEffect } from "react";

// The browser's install event (Android / desktop Chrome), kept for /install.
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    flexitInstallPrompt?: InstallPromptEvent | null;
  }
}

export const INSTALL_READY_EVENT = "flexit-install-ready";

// Registers the service worker (production only, so dev builds are never
// served from cache) and keeps the install event for the /install page.
export default function PwaSetup() {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.flexitInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_READY_EVENT));
    };
    const onInstalled = () => {
      window.flexitInstallPrompt = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker failed", err));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
