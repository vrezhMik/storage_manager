"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DocumentList from "../components/DocumentList";
import AuthGuard from "../../components/AuthGuard";
import { authFetch, USER_MANUAL_ALLOWED_KEY } from "../../lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000/api";

export type PurchaseDoc = {
  id: string;
  date: string;
  transactionDate?: string;
  title: string;
  clientId?: string;
  items?: any[];
};

const STORAGE_KEY = "purchases-data";

export default function DocumentsInPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<PurchaseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let hadCache = false;

    const cached = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setDocs(parsed);
          hadCache = true;
          setLoading(false);
        }
      } catch {
        // ignore bad cache
      }
    }

    const fetchPurchases = async () => {
      if (!hadCache) setLoading(true);
      setError(null);
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await authFetch(`${API_BASE}/purchases`, {
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
              transactionDate: doc?.Date ?? "",
              title: doc?.ClientName ?? "",
              clientId: doc?.ClientID ?? doc?.ClientId ?? "",
              items: Array.isArray(doc?.Items) ? doc.Items : [],
            }))
          : [];

        setDocs(mapped);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
        } catch {
        }
      } catch (err: any) {
        if (!active || controller.signal.aborted || err?.name === "AbortError") {
          return;
        }
        setError(err?.message ?? "Կապի սխալ, փորձեք կրկին");
      } finally {
        if (active) setLoading(false);
        clearTimeout(timeout);
      }
    };

    fetchPurchases();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <AuthGuard>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <DocumentList
            documents={docs}
            loading={loading}
            onSelect={(id) =>
              router.push(`/documents/in/single?id=${encodeURIComponent(id)}`)
            }
          />
        </main>
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
