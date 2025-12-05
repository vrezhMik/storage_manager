"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChevronLeftIcon from "../../UI/ChevronLeftIcon";
import KeyIcon from "../../UI/KeyIcon";
import LogoutIcon from "../../UI/LogoutIcon";
import DocumentList from "../components/DocumentList";
import AuthGuard from "../../components/AuthGuard";
import {
  clearAuthStorage,
  ACCESS_TOKEN_KEY,
  USER_MANUAL_ALLOWED_KEY,
} from "../../lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000/api";

export type PurchaseDoc = {
  id: string;
  date: string;
  title: string;
  items?: any[];
};

const STORAGE_KEY = "purchases-data";

export default function DocumentsInPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<PurchaseDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedOnce = useRef(false);

  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;

    const cached = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setDocs(parsed);
        }
      } catch {
        // ignore bad cache
      }
    }

    const fetchPurchases = async () => {
      setLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const token = localStorage.getItem(ACCESS_TOKEN_KEY);
        if (!token) {
          throw new Error("Missing auth token");
        }

        const res = await fetch(`${API_BASE}/purchases`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          let message = `Request failed (${res.status})`;
          try {
            const body = JSON.parse(bodyText);
            message = body?.message ?? message;
          } catch {
            if (bodyText) message = bodyText;
          }
          throw new Error(message);
        }

        const text = await res.text();
        const data = JSON.parse(text);
        const mapped: PurchaseDoc[] = Array.isArray(data?.Documents)
          ? data.Documents.map((doc: any) => ({
              id: doc?.Number ?? "-",
              date: (doc?.Date ?? "").split("T")[0] || "",
              title: doc?.ClientName ?? "",
              items: Array.isArray(doc?.Items) ? doc.Items : [],
            }))
          : [];

        setDocs(mapped);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
        } catch {
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          setError("Սպասարկողը չի արձագանքում, փորձեք կրկին");
        } else {
          setError(err?.message ?? "Կապի սխալ, փորձեք կրկին");
        }
      } finally {
        setLoading(false);
        clearTimeout(timeout);
      }
    };

    fetchPurchases();
  }, []);

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
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <DocumentList
              documents={docs}
              onSelect={(id) => router.push(`/documents/in/${id}`)}
            />
            {loading && (
              <div className="mt-4 text-sm text-muted-foreground">
                Բեռնում...
              </div>
            )}
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
