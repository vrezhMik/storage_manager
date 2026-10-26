"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import { API_BASE, authFetch } from "../../lib/auth";
import DateRangeModal, { DateRange, formatDisplayDate } from "./DateRangeModal";
import ResultView from "./ResultView";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const rangeFromUrl = (): DateRange | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";
  return DATE_RE.test(start) && DATE_RE.test(end) ? { start, end } : null;
};

type Props<T> = {
  title: string;
  hrefFor: (range: DateRange) => Route;
  // Pulls the report rows out of the API response; null = unknown shape.
  extractRows: (data: unknown) => T[] | null;
  renderRows: (rows: T[], range: DateRange) => ReactNode;
  // API path under API_BASE, e.g. "sales".
  apiPath: string;
};

// Shared shell for reports built on the Sales API: date range in the URL,
// a date picker, loading/error states and a table renderer.
export default function SalesReportPage<T>({
  title,
  hrefFor,
  renderRows,
  apiPath,
  extractRows,
}: Props<T>) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [data, setData] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = rangeFromUrl();
    setRange(fromUrl);
    if (!fromUrl) setModalOpen(true);
  }, []);

  useEffect(() => {
    if (!range) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(undefined);
    authFetch<unknown>(
      `${API_BASE}/${apiPath}?start=${range.start}&end=${range.end}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!controller.signal.aborted) setData(res ?? null);
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Sales report failed", err);
        setError("Չհաջողվեց ստանալ տվյալները");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, apiPath]);

  const rows = useMemo(
    () => (data === undefined ? null : extractRows(data)),
    [data, extractRows],
  );

  const handleSubmit = useCallback(
    (next: DateRange) => {
      setModalOpen(false);
      setRange(next);
      router.replace(hrefFor(next));
    },
    [router, hrefFor],
  );

  const handleClose = useCallback(() => {
    setModalOpen(false);
    if (!range) router.back();
  }, [range, router]);

  return (
    <AuthGuard section="reports">
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow p-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{title}</h2>
                {range && (
                  <p className="text-sm text-muted-foreground">
                    {formatDisplayDate(range.start)} – {formatDisplayDate(range.end)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center justify-center rounded-md border border-input px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
              >
                Փոխել
              </button>
            </div>

            {range && (
              <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  </div>
                ) : error ? (
                  <p className="text-sm text-red-600">{error}</p>
                ) : data !== undefined ? (
                  rows && range ? renderRows(rows, range) : <ResultView value={data} />
                ) : null}
              </div>
            )}
          </div>
        </main>
      </div>
      <DateRangeModal
        open={modalOpen}
        title={title}
        initial={range ?? undefined}
        onClose={handleClose}
        onSubmit={handleSubmit}
      />
    </AuthGuard>
  );
}
