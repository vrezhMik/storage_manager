"use client";

import { useRouter } from "next/navigation";
import ChevronLeftIcon from "../../UI/ChevronLeftIcon";
import KeyIcon from "../../UI/KeyIcon";
import LogoutIcon from "../../UI/LogoutIcon";
import DocumentList from "../components/DocumentList";
import { inDocs } from "./data";
import AuthGuard from "../../components/AuthGuard";
import { clearAuthStorage } from "../../lib/auth";

export default function DocumentsInPage() {
  const router = useRouter();
  const handleLogout = () => {
    clearAuthStorage();
    router.replace("/login");
  };

  return (
    <AuthGuard>
      <div className="App">
        <div className="min-h-screen bg-background">
          <header className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push("/")}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <h1 className="text-lg font-semibold text-foreground">Մուտքեր</h1>
              </div>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0">
                  <KeyIcon className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                  onClick={handleLogout}
                >
                  <LogoutIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <main className="container mx-auto px-4 py-6 pb-20">
            <DocumentList
              documents={inDocs}
              onSelect={(id) => router.push(`/documents/in/${id}`)}
            />
          </main>
        </div>
        <section
          aria-label="Notifications alt+T"
          tabIndex={-1}
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
        ></section>
      </div>
    </AuthGuard>
  );
}
