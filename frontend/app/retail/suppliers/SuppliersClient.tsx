"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import { loadErrorText } from "../../lib/auth";
import { formatDisplayDate } from "../../reports/components/DateRangeModal";
import {
  buildSuppliers,
  DEFAULT_DAYS,
  isLate,
  loadSuppliers,
  oneDecimal,
  Supplier,
  supplierHref,
  SuppliersData,
  todayIso,
} from "./suppliersData";

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";

export function LateBadge({ supplier: s }: { supplier: Supplier }) {
  if (s.lateDays === null) {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">քիչ տվյալ</span>;
  }
  if (isLate(s)) {
    return (
      <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
        ուշանում է {s.lateDays} օր
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
      {s.lateDays === 0 ? "պետք է բերի այսօր" : `սպասվում է ${formatDisplayDate(s.expectedDate!).slice(0, 5)}`}
    </span>
  );
}

export function SuppliersView({
  date,
  onDateChange,
  showAll,
  onShowAll,
  data,
  loading,
  error,
}: {
  date: string;
  onDateChange: (date: string) => void;
  showAll: boolean;
  onShowAll: (all: boolean) => void;
  data: SuppliersData | null;
  loading: boolean;
  error: string | null;
}) {
  const suppliers = useMemo(() => (data ? buildSuppliers(data, date) : []), [data, date]);
  const late = suppliers.filter(isLate).sort((a, b) => (b.lateDays ?? 0) - (a.lateDays ?? 0));
  const list = showAll ? [...suppliers].sort((a, b) => b.lastDate.localeCompare(a.lastDate)) : late;

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <Link href={"/retail" as Route} className="text-xs font-medium text-primary hover:underline">
                ← Մանրածախ
              </Link>
              <h2 className="text-xl font-semibold text-foreground">Մատակարարներ</h2>
              <p className="text-sm text-muted-foreground">
                Ռիթմը՝ վերջին {DEFAULT_DAYS} օրվա մուտքերով · {formatDisplayDate(date)} դրությամբ
              </p>
            </div>
            <input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Ամսաթիվ"
            />
          </div>

          {error ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : data?.ErrorMessage === "Store not found" ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">
                Ձեր խանութը 1C-ում չգտնվեց։ Ադմինկայում ստուգեք խանութի անունը։
              </p>
            </div>
          ) : loading && !data ? (
            <div className={`${cardClass} space-y-2`}>
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          ) : (
            <div className={`${cardClass} space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap gap-2">
                {[
                  { all: false, label: `Ուշացածներ (${late.length})` },
                  { all: true, label: `Բոլորը (${suppliers.length})` },
                ].map((tab) => (
                  <button
                    key={tab.label}
                    type="button"
                    onClick={() => onShowAll(tab.all)}
                    aria-pressed={showAll === tab.all}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      showAll === tab.all ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {showAll ? "Վերջին ժամանակահատվածում մուտքեր չկան" : "Ուշացած մատակարարներ չկան 👍"}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {list.map((s) => (
                    <li key={s.name}>
                      <Link
                        href={supplierHref(s.name, date) as Route}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 hover:bg-accent/50"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground break-words">{s.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.avgInterval !== null ? `սովորաբար՝ ${oneDecimal(s.avgInterval)} օրը մեկ · ` : ""}
                            վերջին՝ {formatDisplayDate(s.lastDate)}
                          </span>
                        </span>
                        <LateBadge supplier={s} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SuppliersClient() {
  const router = useRouter();
  const params = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : todayIso();
  const showAll = params.get("all") === "1";
  const [data, setData] = useState<SuppliersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadSuppliers(date)
      .then((d) => alive && setData(d))
      .catch((err) => {
        console.error("Suppliers failed", err);
        if (alive) setError(loadErrorText(err));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date]);

  const go = (d: string, all: boolean) => router.replace(`/retail/suppliers/?date=${d}${all ? "&all=1" : ""}` as Route);

  return (
    <AuthGuard section="retail">
      <SuppliersView
        date={date}
        onDateChange={(d) => go(d, showAll)}
        showAll={showAll}
        onShowAll={(all) => go(date, all)}
        data={data}
        loading={loading}
        error={error}
      />
    </AuthGuard>
  );
}
