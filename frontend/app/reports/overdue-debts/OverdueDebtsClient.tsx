"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import AuthGuard from "../../components/AuthGuard";
import { API_BASE, authFetch } from "../../lib/auth";
import { formatDisplayDate } from "../components/DateRangeModal";
import ExcelButton from "../../components/ExcelButton";
import MobileRows from "../components/MobileRows";
import { downloadXlsx } from "../../lib/excel";
import { formatAmount, stickyClass, tdClass, thClass, toNumber } from "../sales/salesData";

// 1C returns { Date, Debts: [{ Менеджер, Партнер, ОбъектРасчетов, Валюта, Долг,
// ДатаПогашения: "yyyy-MM-dd" }] }: one row per unpaid part with its due date.
export type OverdueData = {
  Date?: string;
  Debts?: {
    Менеджер?: string;
    Партнер?: string;
    ОбъектРасчетов?: string;
    Валюта?: string;
    Долг?: number | string;
    ДатаПогашения?: string;
  }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

type Balance = { total: number; overdue: number; maxDays: number };
type Partner = Balance & { name: string };
type Manager = Balance & { name: string; partners: Partner[] };

const emptyBalance = (): Balance => ({ total: 0, overdue: 0, maxDays: 0 });

const addTo = (target: Balance, amount: number, days: number) => {
  target.total += amount;
  if (days > 0 && amount > 0) {
    target.overdue += amount;
    target.maxDays = Math.max(target.maxDays, days);
  }
};

const daysClass = (days: number) => {
  if (days > 60) return "bg-red-100 text-red-800";
  if (days > 30) return "bg-orange-100 text-orange-800";
  return "bg-amber-100 text-amber-800";
};

const percent = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : "—";

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";

// Phone cards: days late, total debt and overdue share under the name.
const overdueMetrics = (b: Balance) => [
  ...(b.overdue > 0 ? [{ label: "Ուշացում", value: `${b.maxDays} օր`, strong: true }] : []),
  { label: "Ընդհանուր", value: formatAmount(b.total) },
  { label: "Ուշացածի %", value: percent(b.overdue, b.total) },
];

function BalanceCells({ balance, bold }: { balance: Balance; bold?: boolean }) {
  return (
    <>
      <td className={`${tdClass} font-semibold ${balance.overdue > 0 ? "text-red-700" : ""}`}>
        {formatAmount(balance.overdue)}
      </td>
      <td className={tdClass}>
        {balance.overdue > 0 ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${daysClass(balance.maxDays)}`}>
            {balance.maxDays}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={`${tdClass} ${bold ? "font-semibold" : ""}`}>{formatAmount(balance.total)}</td>
      <td className={tdClass}>{percent(balance.overdue, balance.total)}</td>
    </>
  );
}

function CurrencyTable({
  currency,
  managers,
  totals,
}: {
  currency: string | null;
  managers: Manager[];
  totals: Balance;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const allExpanded = managers.length > 0 && managers.every((m) => expanded.has(m.name));
  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className={`${cardClass} space-y-2`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          Ժամկետանց պարտքեր{currency ? `, ${currency}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(allExpanded ? new Set() : new Set(managers.map((m) => m.name)))}
          className="hidden md:inline text-xs font-medium text-primary hover:underline"
        >
          {allExpanded ? "Փակել բոլորը" : "Բացել բոլորը"}
        </button>
      </div>
      <div className="md:hidden">
        <MobileRows
          rows={managers.map((m) => ({
            key: m.name,
            title: m.name,
            value: formatAmount(m.overdue),
            metrics: overdueMetrics(m),
            children: m.partners.map((p) => ({ key: `${m.name}::${p.name}`, title: p.name, value: formatAmount(p.overdue), metrics: overdueMetrics(p) })),
          }))}
          total={{ key: "total", title: "Ընդամենը", value: formatAmount(totals.overdue), metrics: overdueMetrics(totals) }}
        />
      </div>
      <div className="hidden md:block overflow-x-auto -mx-5 px-5">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className={`${thClass} ${stickyClass}`}>Մենեջեր / Գործընկեր</th>
              <th className={`${thClass} text-right`}>Ուշացած գումար</th>
              <th className={`${thClass} text-right`}>Ուշացում, օր</th>
              <th className={`${thClass} text-right`}>Ընդհանուր պարտք</th>
              <th className={`${thClass} text-right`}>Ուշացածի %</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((manager) => {
              const isOpen = expanded.has(manager.name);
              return (
                <Fragment key={manager.name}>
                  <tr className="bg-muted/30">
                    <th
                      scope="row"
                      className={`${thClass} ${stickyClass} bg-muted text-foreground font-semibold max-w-[14rem] whitespace-normal`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(manager.name)}
                        aria-expanded={isOpen}
                        className="inline-flex items-center gap-2 text-left"
                      >
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-input bg-background text-sm leading-none">
                          {isOpen ? "−" : "+"}
                        </span>
                        {manager.name}
                      </button>
                    </th>
                    <BalanceCells balance={manager} bold />
                  </tr>
                  {isOpen &&
                    manager.partners.map((partner) => (
                      <tr key={`${manager.name}::${partner.name}`}>
                        <th
                          scope="row"
                          className={`${thClass} ${stickyClass} pl-10 text-foreground font-normal max-w-[14rem] whitespace-normal`}
                        >
                          {partner.name}
                        </th>
                        <BalanceCells balance={partner} />
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50">
              <th scope="row" className={`${thClass} ${stickyClass} bg-muted text-foreground`}>
                Ընդամենը
              </th>
              <BalanceCells balance={totals} bold />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

type ViewProps = {
  date: string;
  onDateChange: (date: string) => void;
  data: OverdueData | null;
  loading: boolean;
  error: string | null;
};

// Presentation only, so it can be rendered without the API.
// One sheet per currency, managers with their partners underneath.
const exportOverdue = (tables: { currency: string | null; managers: Manager[]; totals: Balance }[], date: string) => {
  const share = (b: Balance) => (b.total > 0 ? Math.round((b.overdue / b.total) * 1000) / 10 : null);
  const cells = (b: Balance) => [b.overdue, b.overdue > 0 ? b.maxDays : null, b.total, share(b)];
  return downloadXlsx(`Ժամկետանց պարտքեր ${formatDisplayDate(date)}`, tables.map((t) => ({
    name: t.currency ?? "Ժամկետանց",
    title: [`Ժամկետանց պարտքեր${t.currency ? `, ${t.currency}` : ""}`, `${formatDisplayDate(date)} դրությամբ`],
    columns: [
      { header: "Մենեջեր / Գործընկեր", width: 42 },
      { header: "Ուշացած գումար", numeric: true },
      { header: "Ուշացում, օր", numeric: true, width: 12 },
      { header: "Ընդհանուր պարտք", numeric: true },
      { header: "Ուշացածի %", numeric: true, width: 12 },
    ],
    rows: t.managers.flatMap((m) => [
      { cells: [m.name, ...cells(m)], level: 0 as const },
      ...m.partners.map((p) => ({ cells: [p.name, ...cells(p)], level: 1 as const })),
    ]),
    total: ["Ընդամենը", ...cells(t.totals)],
  })));
};

export function OverdueDebtsView({ date, onDateChange, data, loading, error }: ViewProps) {
  const [showAll, setShowAll] = useState(false);

  // One table per currency, so different currencies are never added up.
  const tables = useMemo(() => {
    const byCurrency = new Map<string, Map<string, Map<string, Balance>>>();
    (data?.Debts ?? []).forEach((row) => {
      const currency = String(row.Валюта ?? "").trim();
      const manager = String(row.Менеджер ?? "").trim() || "Առանց մենեջերի";
      const partner = String(row.Партнер ?? "").trim() || "—";
      const due = String(row.ДатаПогашения ?? "").slice(0, 10);
      const days = /^\d{4}-\d{2}-\d{2}$/.test(due) ? dayNumber(date) - dayNumber(due) : 0;

      const managers = byCurrency.get(currency) ?? new Map<string, Map<string, Balance>>();
      const partners = managers.get(manager) ?? new Map<string, Balance>();
      const balance = partners.get(partner) ?? emptyBalance();
      addTo(balance, toNumber(row.Долг), days);
      partners.set(partner, balance);
      managers.set(manager, partners);
      byCurrency.set(currency, managers);
    });

    return Array.from(byCurrency, ([currency, managersMap]) => {
      const totals = emptyBalance();
      const managers: Manager[] = Array.from(managersMap, ([name, partnersMap]) => {
        const manager: Manager = { name, ...emptyBalance(), partners: [] };
        partnersMap.forEach((balance, partnerName) => {
          if (!showAll && balance.overdue <= 0) return;
          manager.partners.push({ name: partnerName, ...balance });
          manager.total += balance.total;
          manager.overdue += balance.overdue;
          manager.maxDays = Math.max(manager.maxDays, balance.maxDays);
        });
        manager.partners.sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
        return manager;
      })
        .filter((m) => m.partners.length > 0)
        .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
      managers.forEach((m) => {
        totals.total += m.total;
        totals.overdue += m.overdue;
        totals.maxDays = Math.max(totals.maxDays, m.maxDays);
      });
      return { currency: currency || null, managers, totals };
    }).sort((a, b) => (a.currency ?? "").localeCompare(b.currency ?? ""));
  }, [data, date, showAll]);

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Ժամկետանց պարտքեր</h2>
              <p className="text-sm text-muted-foreground">{formatDisplayDate(date)} դրությամբ</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {tables.length > 0 && <ExcelButton onExport={() => exportOverdue(tables, date)} />}
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="h-4 w-4"
                />
                Ցույց տալ նաև առանց ուշացման
              </label>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => e.target.value && onDateChange(e.target.value)}
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Ամսաթիվ"
              />
            </div>
          </div>

          {error ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : loading && !data ? (
            <div className={`${cardClass} space-y-2`}>
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          ) : tables.length === 0 ? (
            <div className={cardClass}>
              <p className="text-sm text-muted-foreground">Ժամկետանց պարտքեր չկան</p>
            </div>
          ) : (
            <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
              {tables.map((table) => (
                <CurrencyTable
                  key={table.currency ?? "-"}
                  currency={table.currency}
                  managers={table.managers}
                  totals={table.totals}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function OverdueDebtsClient() {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<OverdueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    authFetch<OverdueData>(`${API_BASE}/overdue-debts?date=${date}`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setData(res ?? {});
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Overdue debts failed", err);
        setError("Չհաջողվեց ստանալ տվյալները");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date]);

  return (
    <AuthGuard section="reports">
      <OverdueDebtsView date={date} onDateChange={setDate} data={data} loading={loading} error={error} />
    </AuthGuard>
  );
}
