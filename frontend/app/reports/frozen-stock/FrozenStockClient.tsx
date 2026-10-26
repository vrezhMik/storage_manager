"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import AuthGuard from "../../components/AuthGuard";
import { API_BASE, authFetch } from "../../lib/auth";
import { formatDisplayDate } from "../components/DateRangeModal";
import { formatAmount, stickyClass, tdClass, thClass, toNumber } from "../sales/salesData";

// 1C returns { Date, Days, Stock: [{ Номенклатура, Склад, Остаток, Себестоимость,
// ДатаПоследнейПродажи: "yyyy-MM-dd" | "" }] }; "" = not sold in the last 365 days.
export type FrozenStockData = {
  Date?: string;
  Days?: number;
  Stock?: {
    Номенклатура?: string;
    Склад?: string;
    Остаток?: number | string;
    Себестоимость?: number | string;
    ДатаПоследнейПродажи?: string;
  }[];
};

const DAY_OPTIONS = [30, 60, 90, 180];
const SEARCH_WINDOW_DAYS = 365;
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

type Item = {
  name: string;
  qty: number;
  cost: number;
  lastSale: string; // "" = never in the search window
  idleDays: number | null; // null = never
};

type Group = { name: string; cost: number; items: Item[] };

const idleClass = (days: number | null) => {
  if (days === null || days >= 180) return "bg-red-100 text-red-800";
  if (days >= 90) return "bg-orange-100 text-orange-800";
  return "bg-amber-100 text-amber-800";
};

const idleLabel = (days: number | null) => (days === null ? `${SEARCH_WINDOW_DAYS}+` : String(days));

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";

type ViewProps = {
  date: string;
  days: number;
  onDateChange: (date: string) => void;
  onDaysChange: (days: number) => void;
  data: FrozenStockData | null;
  loading: boolean;
  error: string | null;
};

// Presentation only, so it can be rendered without the API.
export function FrozenStockView({ date, days, onDateChange, onDaysChange, data, loading, error }: ViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { groups, totalCost, itemCount } = useMemo(() => {
    const byWarehouse = new Map<string, Item[]>();
    (data?.Stock ?? []).forEach((row) => {
      const lastSale = String(row.ДатаПоследнейПродажи ?? "").slice(0, 10);
      const item: Item = {
        name: String(row.Номенклатура ?? "").trim() || "—",
        qty: toNumber(row.Остаток),
        cost: toNumber(row.Себестоимость),
        lastSale,
        idleDays: /^\d{4}-\d{2}-\d{2}$/.test(lastSale) ? dayNumber(date) - dayNumber(lastSale) : null,
      };
      const warehouse = String(row.Склад ?? "").trim() || "—";
      byWarehouse.set(warehouse, [...(byWarehouse.get(warehouse) ?? []), item]);
    });
    const groups: Group[] = Array.from(byWarehouse, ([name, items]) => ({
      name,
      cost: items.reduce((sum, i) => sum + i.cost, 0),
      items: [...items].sort((a, b) => b.cost - a.cost),
    })).sort((a, b) => b.cost - a.cost);
    return {
      groups,
      totalCost: groups.reduce((sum, g) => sum + g.cost, 0),
      itemCount: groups.reduce((sum, g) => sum + g.items.length, 0),
    };
  }, [data, date]);

  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.name));
  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Սառեցված մնացորդ</h2>
                <p className="text-sm text-muted-foreground">
                  {formatDisplayDate(date)} դրությամբ, {days} օր և ավելի չվաճառված
                </p>
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Չվաճառված՝</span>
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onDaysChange(option)}
                  aria-pressed={days === option}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    days === option
                      ? "bg-primary text-primary-foreground shadow"
                      : "border border-input hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {option}+ օր
                </button>
              ))}
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
          ) : (
            <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
              <div className="grid gap-4 grid-cols-2">
                <div className={`${cardClass} space-y-1`}>
                  <div className="text-sm text-muted-foreground">Սառեցված գումար</div>
                  <div className="text-2xl font-bold text-red-700 tabular-nums">{formatAmount(totalCost)}</div>
                  <div className="text-xs text-muted-foreground">ինքնարժեքով</div>
                </div>
                <div className={`${cardClass} space-y-1`}>
                  <div className="text-sm text-muted-foreground">Ապրանքներ</div>
                  <div className="text-2xl font-bold text-foreground tabular-nums">{itemCount}</div>
                  <div className="text-xs text-muted-foreground">{groups.length} պահեստում</div>
                </div>
              </div>

              <div className={`${cardClass} space-y-2`}>
                {groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Սառեցված ապրանք չկա</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Ըստ պահեստների</span>
                      <button
                        type="button"
                        onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.name)))}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {allExpanded ? "Փակել բոլորը" : "Բացել բոլորը"}
                      </button>
                    </div>
                    <div className="overflow-x-auto -mx-5 px-5">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr>
                            <th className={`${thClass} ${stickyClass}`}>Պահեստ / Ապրանք</th>
                            <th className={`${thClass} text-right`}>Մնացորդ</th>
                            <th className={`${thClass} text-right`}>Ինքնարժեք</th>
                            <th className={`${thClass} text-right`}>Վերջին վաճառք</th>
                            <th className={`${thClass} text-right`}>Օր առանց վաճառքի</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((group) => {
                            const isOpen = expanded.has(group.name);
                            return (
                              <Fragment key={group.name}>
                                <tr className="bg-muted/30">
                                  <th
                                    scope="row"
                                    className={`${thClass} ${stickyClass} bg-muted text-foreground font-semibold max-w-[16rem] whitespace-normal`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggle(group.name)}
                                      aria-expanded={isOpen}
                                      className="inline-flex items-center gap-2 text-left"
                                    >
                                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-input bg-background text-sm leading-none">
                                        {isOpen ? "−" : "+"}
                                      </span>
                                      {group.name}
                                      <span className="font-normal text-muted-foreground">({group.items.length})</span>
                                    </button>
                                  </th>
                                  <td className={tdClass} />
                                  <td className={`${tdClass} font-semibold`}>{formatAmount(group.cost)}</td>
                                  <td className={tdClass} />
                                  <td className={tdClass} />
                                </tr>
                                {isOpen &&
                                  group.items.map((item, idx) => (
                                    <tr key={`${group.name}::${item.name}::${idx}`}>
                                      <th
                                        scope="row"
                                        className={`${thClass} ${stickyClass} pl-10 text-foreground font-normal max-w-[16rem] whitespace-normal`}
                                      >
                                        {item.name}
                                      </th>
                                      <td className={tdClass}>{formatAmount(item.qty)}</td>
                                      <td className={`${tdClass} font-semibold`}>{formatAmount(item.cost)}</td>
                                      <td className={tdClass}>
                                        {item.lastSale ? (
                                          formatDisplayDate(item.lastSale)
                                        ) : (
                                          <span className="text-muted-foreground">Չի վաճառվել</span>
                                        )}
                                      </td>
                                      <td className={tdClass}>
                                        <span
                                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${idleClass(item.idleDays)}`}
                                        >
                                          {idleLabel(item.idleDays)}
                                        </span>
                                      </td>
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
                            <td className={tdClass} />
                            <td className={`${tdClass} font-bold`}>{formatAmount(totalCost)}</td>
                            <td className={tdClass} />
                            <td className={tdClass} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function FrozenStockClient() {
  const [date, setDate] = useState(today);
  const [days, setDays] = useState(60);
  const [data, setData] = useState<FrozenStockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    authFetch<FrozenStockData>(`${API_BASE}/frozen-stock?date=${date}&days=${days}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) setData(res ?? {});
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Frozen stock failed", err);
        setError("Չհաջողվեց ստանալ տվյալները");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, days]);

  return (
    <AuthGuard section="reports">
      <FrozenStockView
        date={date}
        days={days}
        onDateChange={setDate}
        onDaysChange={setDays}
        data={data}
        loading={loading}
        error={error}
      />
    </AuthGuard>
  );
}
