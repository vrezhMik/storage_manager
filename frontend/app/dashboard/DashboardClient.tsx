"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGuard from "../components/AuthGuard";
import { API_BASE, authFetch } from "../lib/auth";
import { formatDisplayDate } from "../reports/components/DateRangeModal";
import { formatAmount, toNumber } from "../reports/sales/salesData";

// 1C returns { Date, SalesToday, SalesMonth, SalesPrevMonth, DebtsTotal, DebtsOverdue?,
// SalesByDay: [{ Период, Сумма }], TopItems: [{ Номенклатура, Сумма }],
// TopPartners: [{ Партнер, Сумма }] }.
export type Dashboard = {
  Date?: string;
  SalesToday?: number | string;
  SalesMonth?: number | string;
  SalesPrevMonth?: number | string;
  DebtsTotal?: number | string;
  DebtsOverdue?: number | string;
  SalesByDay?: { Период?: string; Сумма?: number | string }[];
  TopItems?: { Номенклатура?: string; Сумма?: number | string }[];
  TopPartners?: { Партнер?: string; Сумма?: number | string }[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toIsoDate(new Date());

// The 30 days ending at `end`, so days without sales still get a (zero) bar.
const last30Days = (end: string) => {
  const [y, m, d] = end.split("-").map(Number);
  return Array.from({ length: 30 }, (_, i) => toIsoDate(new Date(y, m - 1, d - 29 + i)));
};

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";

function KpiCard({
  label,
  value,
  children,
}: {
  label: string;
  value: number | null;
  children?: React.ReactNode;
}) {
  return (
    <div className={`${cardClass} space-y-1`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold text-foreground tabular-nums">
        {value === null ? "—" : formatAmount(value)}
      </div>
      {children}
    </div>
  );
}

function MonthChange({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return <div className="text-xs text-muted-foreground">Նախորդ ամսվա տվյալ չկա</div>;
  }
  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  return (
    <div className="text-xs">
      <span className={`font-semibold ${up ? "text-green-600" : "text-red-600"}`}>
        {up ? "▲" : "▼"} {Math.abs(change).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%
      </span>{" "}
      <span className="text-muted-foreground">
        նախորդ ամսվա նույն օրերի համեմատ ({formatAmount(previous)})
      </span>
    </div>
  );
}

function SalesChart({ days, selected }: { days: { date: string; amount: number }[]; selected: string }) {
  const max = Math.max(...days.map((d) => d.amount), 0);
  const total = days.reduce((sum, d) => sum + d.amount, 0);
  return (
    <div className={`${cardClass} space-y-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-foreground">Վաճառք վերջին 30 օրում</h3>
        <span className="text-sm text-muted-foreground tabular-nums">{formatAmount(total)}</span>
      </div>
      {max === 0 ? (
        <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>
      ) : (
        <div>
          <div className="flex h-40 items-end gap-[2px]">
            {days.map((day) => (
              <div
                key={day.date}
                title={`${formatDisplayDate(day.date)}: ${formatAmount(day.amount)}`}
                className={`flex-1 rounded-t-sm ${
                  day.date === selected ? "bg-[#cfb40b]" : "bg-primary/80 hover:bg-primary"
                }`}
                style={{ height: `${day.amount > 0 ? Math.max((day.amount / max) * 100, 2) : 0}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>{formatDisplayDate(days[0].date).slice(0, 5)}</span>
            <span>{formatDisplayDate(days[14].date).slice(0, 5)}</span>
            <span>{formatDisplayDate(days[29].date).slice(0, 5)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { name: string; amount: number }[] }) {
  const max = Math.max(...rows.map((r) => r.amount), 0);
  return (
    <div className={`${cardClass} space-y-3`}>
      <h3 className="font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row, idx) => (
            <li key={`${row.name}-${idx}`} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground break-words">
                  <span className="text-muted-foreground">{idx + 1}.</span> {row.name}
                </span>
                <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                  {formatAmount(row.amount)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${max > 0 ? (row.amount / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const optionalNumber = (value: unknown) =>
  value === undefined || value === null || value === "" ? null : toNumber(value);

export default function DashboardClient() {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    authFetch<Dashboard>(`${API_BASE}/dashboard?date=${date}`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setData(res ?? {});
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Dashboard failed", err);
        setError("Չհաջողվեց ստանալ տվյալները");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date]);

  return (
    <AuthGuard section="dashboard">
      <DashboardView
        date={date}
        onDateChange={setDate}
        data={data}
        loading={loading}
        error={error}
      />
    </AuthGuard>
  );
}

type ViewProps = {
  date: string;
  onDateChange: (date: string) => void;
  data: Dashboard | null;
  loading: boolean;
  error: string | null;
};

// Presentation only, so it can be rendered without the API.
export function DashboardView({ date, onDateChange, data, loading, error }: ViewProps) {
  const days = useMemo(() => {
    const byDay = new Map<string, number>();
    (data?.SalesByDay ?? []).forEach((row) => {
      const day = String(row.Период ?? "").slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + toNumber(row.Сумма));
    });
    return last30Days(date).map((day) => ({ date: day, amount: byDay.get(day) ?? 0 }));
  }, [data, date]);

  const topItems = (data?.TopItems ?? []).map((r) => ({
    name: String(r.Номенклатура ?? "—"),
    amount: toNumber(r.Сумма),
  }));
  const topPartners = (data?.TopPartners ?? []).map((r) => ({
    name: String(r.Партнер ?? "—"),
    amount: toNumber(r.Сумма),
  }));
  const overdue = optionalNumber(data?.DebtsOverdue);

  return (
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  <span className="text-[#cfb40b]">Flexit</span> Դաշբորդ
                </h2>
                <p className="text-sm text-muted-foreground">{formatDisplayDate(date)} դրությամբ</p>
              </div>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => e.target.value && onDateChange(e.target.value)}
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Ամսաթիվ"
              />
            </div>

            {error ? (
              <div className={cardClass}>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : loading && !data ? (
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`${cardClass} space-y-2`}>
                    <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                    <div className="h-7 w-2/3 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
                <div className="grid gap-4 md:grid-cols-3">
                  <KpiCard label="Վաճառք այսօր" value={optionalNumber(data?.SalesToday)} />
                  <KpiCard label="Վաճառք ամսվա սկզբից" value={optionalNumber(data?.SalesMonth)}>
                    <MonthChange
                      current={toNumber(data?.SalesMonth)}
                      previous={toNumber(data?.SalesPrevMonth)}
                    />
                  </KpiCard>
                  <KpiCard label="Դեբիտորական պարտք" value={optionalNumber(data?.DebtsTotal)}>
                    {overdue !== null && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">որից ուշացած պարտք՝ </span>
                        <span
                          className={`font-semibold tabular-nums ${overdue > 0 ? "text-red-600" : "text-green-600"}`}
                        >
                          {formatAmount(overdue)}
                        </span>
                        {overdue > 0 && toNumber(data?.DebtsTotal) > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {" "}
                            (
                            {((overdue / toNumber(data?.DebtsTotal)) * 100).toLocaleString("ru-RU", {
                              maximumFractionDigits: 1,
                            })}
                            %)
                          </span>
                        )}
                      </div>
                    )}
                  </KpiCard>
                </div>

                <SalesChart days={days} selected={date} />

                <div className="grid gap-4 md:grid-cols-2">
                  <TopList title="Թոփ 5 ապրանք (ամիս)" rows={topItems} />
                  <TopList title="Թոփ 5 գործընկեր (ամիս)" rows={topPartners} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
  );
}
