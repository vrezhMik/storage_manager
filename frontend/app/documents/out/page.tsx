"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DocumentList from "../components/DocumentList";
import AuthGuard from "../../components/AuthGuard";
import { authFetch, USER_MANUAL_ALLOWED_KEY } from "../../lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "https://admin.flexit.am/api";

const mapDocId = (doc: any, idx: number) =>
  String(
    doc?.Number ??
      doc?.DocEntry ??
      doc?.DocumentID ??
      doc?.DocumentId ??
      doc?.ID ??
      doc?.Id ??
      doc?.DocNum ??
      doc?.Guid ??
      idx
  );

export type OrderDoc = {
  id: string;
  date: string;
  transactionDate?: string;
  title: string;
  clientId?: string;
  items?: any[];
};

const STORAGE_KEY = "orders-data";

export default function DocumentsOutPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);
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

    const fetchOrders = async () => {
      if (!hadCache) setLoading(true);
      setError(null);
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await authFetch(`${API_BASE}/orders`, {
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
        const mapped: OrderDoc[] = Array.isArray(data?.Documents)
          ? data.Documents.map((doc: any, idx: number) => ({
              id: mapDocId(doc, idx),
              date: (doc?.Date ?? "").split("T")[0] || "",
              transactionDate: doc?.Date ?? "",
              title: doc?.ClientName ?? "",
              clientId: doc?.ClientID ?? "",
              items: Array.isArray(doc?.Items) ? doc.Items : [],
            }))
          : [];
        if (active) {
          setDocs(mapped);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
          } catch {
          }
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

    fetchOrders();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (!hydrated) {
    return null;
  }

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
            onSelect={(id) => router.push(`/documents/out/single?id=${encodeURIComponent(id)}`)}
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
