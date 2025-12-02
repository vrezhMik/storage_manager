"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toast, type ToastState, type ToastType } from "./UI/Toast";
import KeyIcon from "./UI/KeyIcon";
import LogoutIcon from "./UI/LogoutIcon";
import RefreshIcon from "./UI/RefreshIcon";
import FileIcon from "./UI/FileIcon";
export default function HomePage() {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: "",
    type: "info",
  });
  const router = useRouter();

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const hideToastAfter = (ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, ms);
  };

  const showToast = (
    message: string,
    type: ToastType = "info",
    autoHideMs?: number
  ) => {
    setToast({ visible: true, message, type });
    if (autoHideMs) {
      hideToastAfter(autoHideMs);
    }
  };

  const showPendingThenSuccess = ({
    pendingText,
    successText,
    delayMs = 1500,
    hideMs = 1500,
  }: {
    pendingText: string;
    successText: string;
    delayMs?: number;
    hideMs?: number;
  }) => {
    showToast(pendingText, "info");
    hideToastAfter(delayMs + hideMs);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      showToast(successText, "success");
      hideToastAfter(hideMs);
    }, delayMs);
  };

  return (
    <div className="App">
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                Գլխավոր էջ
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/password"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
              >
                <KeyIcon />
              </Link>
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                onClick={() => router.push("/login")}
              >
                <LogoutIcon />
              </button>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">
                Ողջույն!
              </h2>
              <p className="text-muted-foreground">Ընտրեք գործողություն</p>
            </div>
            <div className="grid gap-4">
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground px-4 py-2 h-20 text-lg font-medium"
                onClick={() =>
                  showPendingThenSuccess({
                    pendingText: "Տվյալների թարմացում...",
                    successText: "Թարմացումը հաջողվեց",
                    delayMs: 1500,
                    hideMs: 1500,
                  })
                }
              >
                <RefreshIcon />
                Տվյալների թարմացում
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-20 text-lg font-medium"
                onClick={() => router.push("/documents")}
              >
                <FileIcon />
                Փաստաթղթերի ցանկ
              </button>
            </div>
          </div>
        </main>
      </div>
      <section
        aria-label="Notifications alt+T"
        tabIndex={-1}
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
      >
        <Toast toast={toast} offsetTop="47px" />
      </section>
    </div>
  );
}
