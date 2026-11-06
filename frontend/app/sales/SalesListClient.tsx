"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthGuard from "../components/AuthGuard";
import { API_BASE, authFetch } from "../lib/auth";
import { formatDisplayDate } from "../reports/components/DateRangeModal";
import { formatAmount } from "../reports/sales/salesData";
import {
  cardClass,
  CONFIRM_SIGN,
  errorText,
  SentDoc,
  SignAnswer,
  SignMethod,
  SIGNING_TEXT,
  TYPE_LABELS,
} from "./salesShared";

const POLL_MS = 3000;

const statusBadge = (d: SentDoc) => {
  switch (d.status) {
    case "ISSUED":
      return { cls: "bg-green-100 text-green-800", text: `Դուրսգրված${d.serialNo ? ` · ${d.serialNo}` : ""}` };
    case "SIGNING":
      return { cls: "bg-blue-100 text-blue-800", text: "Ստորագրվում է…" };
    case "DRAFT":
      return { cls: "bg-amber-100 text-amber-800", text: "Սևագիր" };
    default:
      return { cls: "bg-red-100 text-red-800", text: "Սխալ" };
  }
};

export function SalesListView() {
  const params = useSearchParams();
  const [docs, setDocs] = useState<SentDoc[] | null>(null);
  const [signMethod, setSignMethod] = useState<SignMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    params.get("created") ? { ok: true, text: "Սևագիրը ստեղծված է e-invoicing-ում։" } : null,
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const polling = useRef(false);

  const load = useCallback(() => {
    authFetch<{ documents: SentDoc[]; signMethod?: SignMethod | null }>(`${API_BASE}/sales/documents`)
      .then((res) => {
        setDocs(res?.documents ?? []);
        setSignMethod(res?.signMethod ?? null);
        setError(null);
      })
      .catch((err) => {
        console.error("Sales documents failed", err);
        setError("Չհաջողվեց ստանալ փաստաթղթերը");
      });
  }, []);
  useEffect(load, [load]);

  // Documents being signed: ask the tax service until they are issued or fail.
  const signing = (docs ?? []).filter((d) => d.status === "SIGNING");
  useEffect(() => {
    if (signing.length === 0 || polling.current) return;
    const timer = window.setTimeout(async () => {
      polling.current = true;
      try {
        const answers = await Promise.all(
          signing.map((d) => authFetch<SignAnswer>(`${API_BASE}/sales/documents/${d.id}/sign-status`).catch(() => null)),
        );
        answers.forEach((a) => {
          if (a?.status === "ISSUED") setNotice({ ok: true, text: `Փաստաթուղթը դուրսգրված է${a.serialNo ? `, սերիա-համար՝ ${a.serialNo}` : ""}։` });
          else if (a?.status === "DRAFT" && a.error) setNotice({ ok: false, text: errorText(a.error) });
        });
        if (answers.some((a) => a && a.status !== "SIGNING")) load();
      } finally {
        polling.current = false;
        setDocs((prev) => (prev ? [...prev] : prev)); // schedule the next check
      }
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [docs, signing.length, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const sign = async (doc: SentDoc) => {
    if (busyId !== null || !window.confirm(CONFIRM_SIGN)) return;
    setBusyId(doc.id);
    setNotice(null);
    try {
      await authFetch<SignAnswer>(`${API_BASE}/sales/documents/${doc.id}/sign`, { method: "POST" });
    } catch (err) {
      setNotice({ ok: false, text: errorText(err) });
    } finally {
      setBusyId(null);
      load();
    }
  };

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Վաճառքներ</h2>
              <p className="text-sm text-muted-foreground">Հաշիվ-վավերագրեր ՊԵԿ-ի e-invoicing համակարգում</p>
            </div>
            <Link
              href={"/sales/new" as Route}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              ＋ Ստեղծել նոր
            </Link>
          </div>

          {notice && (
            <p className={`rounded-xl px-4 py-3 text-sm ${notice.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {notice.ok ? "✓ " : "✕ "}
              {notice.text}
            </p>
          )}
          {signing.length > 0 && signMethod && (
            <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">⏳ {SIGNING_TEXT[signMethod]}</p>
          )}

          <div className={`${cardClass} space-y-2`}>
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : docs === null ? (
              <div className="space-y-2">
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
              </div>
            ) : docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Դեռ փաստաթղթեր չկան։ Սեղմեք «Ստեղծել նոր»։</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {docs.map((d) => {
                  const badge = statusBadge(d);
                  return (
                    <li key={d.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3">
                      <span className="min-w-0">
                        <span className="block font-medium break-words">{d.buyerName || d.buyerTin}</span>
                        <span className="block text-xs text-muted-foreground">
                          {TYPE_LABELS[d.type]}
                          {d.buyerTin ? ` · ՀՎՀՀ ${d.buyerTin}` : ""}
                          {d.deliveredAt ? ` · ${formatDisplayDate(d.deliveredAt)}` : ""}
                          {d.user ? ` · ${d.user}` : ""}
                        </span>
                        {d.error && d.status !== "ISSUED" && <span className="block text-xs text-red-700 break-words">{errorText(d.error)}</span>}
                      </span>
                      <span className="flex flex-wrap items-center justify-end gap-2">
                        <span className="font-semibold tabular-nums">{formatAmount(d.total)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
                        {d.status === "DRAFT" && signMethod && (
                          <button
                            type="button"
                            onClick={() => sign(d)}
                            disabled={busyId !== null || signing.length > 0}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {busyId === d.id ? "Ուղարկվում է…" : "✍ Ստորագրել"}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SalesListClient() {
  return (
    <AuthGuard section="sales">
      <SalesListView />
    </AuthGuard>
  );
}
