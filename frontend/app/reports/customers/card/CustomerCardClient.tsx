"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthGuard from "../../../components/AuthGuard";
import { API_BASE, authFetch } from "../../../lib/auth";
import { formatDisplayDate } from "../../components/DateRangeModal";
import { formatAmount, rowPartner, tdClass, thClass, toNumber } from "../../sales/salesData";
import { SinceBadge } from "../CustomersClient";
import {
  buildCustomers,
  CustomerSource,
  hasMoney,
  isInactive,
  isLate,
  loadCustomerSource,
  moneyText,
  PERIODS,
  saleDate,
} from "../customerData";

// /sales-monthly?group=partner-item&partner=NAME: what this customer buys,
// { Sales: [{ Месяц: "yyyy-MM", Номенклатура, Количество, Сумма }] }.
type ItemRow = { Месяц?: string; Номенклатура?: string; Количество?: number | string; Сумма?: number | string };
type Item = { name: string; qty: number; total: number; months: Set<string>; lastMonth: string };

const MONTHS = ["Հնվ", "Փտր", "Մրտ", "Ապր", "Մյս", "Հնս", "Հլս", "Օգս", "Սեպ", "Հոկ", "Նոյ", "Դեկ"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ""} ${ym.slice(0, 4)}`;
const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";
const ITEM_LIMIT = 30;

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-foreground break-words">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Items({ name, source }: { name: string; source: CustomerSource }) {
  const [rows, setRows] = useState<ItemRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setFailed(false);
    const { start, end } = source.range;
    authFetch<{ Sales?: ItemRow[] }>(
      `${API_BASE}/sales-monthly?start=${start}&end=${end}&group=partner-item&partner=${encodeURIComponent(name)}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        const list = res?.Sales;
        // An old 1C function ignores GroupBy and sends rows without items.
        if (!Array.isArray(list) || (list.length > 0 && !list.some((r) => r.Номенклатура))) setFailed(true);
        else setRows(list);
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [name, source]);

  const items = useMemo(() => {
    const byName = new Map<string, Item>();
    (rows ?? []).forEach((r) => {
      const key = String(r.Номенклатура ?? "").trim() || "—";
      const month = String(r.Месяц ?? "").slice(0, 7);
      const item = byName.get(key) ?? { name: key, qty: 0, total: 0, months: new Set<string>(), lastMonth: "" };
      item.qty += toNumber(r.Количество);
      item.total += toNumber(r.Сумма);
      if (month) {
        item.months.add(month);
        if (month > item.lastMonth) item.lastMonth = month;
      }
      byName.set(key, item);
    });
    return Array.from(byName.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const total = items.reduce((s, i) => s + i.total, 0);
  const shown = showAll ? items : items.slice(0, ITEM_LIMIT);

  return (
    <div className={`${cardClass} space-y-3`}>
      <h3 className="font-semibold text-foreground">Ինչ է գնում</h3>
      {failed ? (
        <p className="text-sm text-muted-foreground">
          Ապրանքների ցուցակը դեռ հասանելի չէ։ 1C-ում պետք է թարմացնել SalesMonthly ֆունկցիան (PartnerItem)։
        </p>
      ) : rows === null ? (
        <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Այս ժամանակահատվածում գնումներ չկան</p>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {shown.map((i) => (
              <div key={i.name} className="rounded-lg border border-border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm text-foreground">{i.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatAmount(i.total)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                  <span>Քանակ՝ {formatAmount(i.qty)}</span>
                  <span>Ամիսներ՝ {i.months.size}</span>
                  {i.lastMonth && <span>Վերջին՝ {monthLabel(i.lastMonth)}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto -mx-5 px-5">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${thClass} text-left`}>Ապրանք</th>
                  <th className={`${thClass} text-right`}>Քանակ</th>
                  <th className={`${thClass} text-right`}>Գումար</th>
                  <th className={`${thClass} text-right`}>Մաս</th>
                  <th className={`${thClass} text-right`}>Քանի ամիս է գնել</th>
                  <th className={`${thClass} text-right`}>Վերջին ամիսը</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.name}>
                    <td className={`${tdClass} text-left whitespace-normal min-w-[14rem]`}>{i.name}</td>
                    <td className={tdClass}>{formatAmount(i.qty)}</td>
                    <td className={`${tdClass} font-semibold`}>{formatAmount(i.total)}</td>
                    <td className={tdClass}>
                      {total > 0 ? `${((i.total / total) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : "—"}
                    </td>
                    <td className={tdClass}>{i.months.size}</td>
                    <td className={tdClass}>{i.lastMonth ? monthLabel(i.lastMonth) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length > ITEM_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showAll ? `Ցույց տալ առաջին ${ITEM_LIMIT}-ը` : `Ցույց տալ բոլոր ${items.length} ապրանքները`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function CardView({ name, days }: { name: string; days: number }) {
  const [source, setSource] = useState<CustomerSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    loadCustomerSource(days)
      .then((s) => alive && setSource(s))
      .catch((err) => {
        console.error("Customer card failed", err);
        if (alive) setError("Չհաջողվեց ստանալ տվյալները");
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const customer = useMemo(
    () => (source ? buildCustomers(source).find((c) => c.name === name) ?? null : null),
    [source, name],
  );

  // Sales of this customer per month and per day.
  const { months, recent } = useMemo(() => {
    const byMonth = new Map<string, number>();
    const byDay = new Map<string, number>();
    if (source) {
      const first = source.range.start.slice(0, 7);
      const last = source.range.end.slice(0, 7);
      for (let ym = first; ym <= last; ) {
        byMonth.set(ym, 0);
        const [y, m] = ym.split("-").map(Number);
        ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      }
      source.sales.forEach((row) => {
        if (rowPartner(row) !== name) return;
        const date = saleDate(row);
        if (!date) return;
        const amount = toNumber(row.СуммаВыручки);
        byMonth.set(date.slice(0, 7), (byMonth.get(date.slice(0, 7)) ?? 0) + amount);
        byDay.set(date, (byDay.get(date) ?? 0) + amount);
      });
    }
    return {
      months: Array.from(byMonth, ([month, value]) => ({ month, value })),
      recent: Array.from(byDay, ([date, value]) => ({ date, value }))
        .filter((d) => d.value !== 0)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10),
    };
  }, [source, name]);

  const max = Math.max(...months.map((m) => m.value), 1);
  const periodLabel = PERIODS.find((p) => p.days === days)?.label ?? `${days} օր`;

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} space-y-1`}>
            <Link
              href={`/reports/customers/?days=${days}` as Route}
              className="text-xs font-medium text-primary hover:underline"
            >
              ← Բոլոր հաճախորդները
            </Link>
            <h2 className="text-xl font-semibold text-foreground break-words">{name}</h2>
            <p className="text-sm text-muted-foreground">
              {customer ? `Մենեջեր՝ ${customer.manager} · ` : ""}վերջին {periodLabel}
              {source ? ` (${formatDisplayDate(source.range.start)} – ${formatDisplayDate(source.range.end)})` : ""}
            </p>
          </div>

          {error ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : !source ? (
            <div className={`${cardClass} space-y-2`}>
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          ) : !customer ? (
            <div className={cardClass}>
              <p className="text-sm text-muted-foreground">Այս ժամանակահատվածում տվյալներ չկան այս հաճախորդի համար</p>
            </div>
          ) : (
            <>
              {(isInactive(customer, 30) || isLate(customer) || hasMoney(customer.overdue)) && (
                <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  {customer.daysSince === null ? (
                    <p>⚠ Վերջին {periodLabel} ընթացքում այս հաճախորդը գնում չի կատարել։</p>
                  ) : isInactive(customer, 30) ? (
                    <p>⚠ Այս հաճախորդը {customer.daysSince} օր է գնում չի կատարել։</p>
                  ) : null}
                  {isLate(customer) && (
                    <p>
                      ⚠ Սովորաբար գնում է {customer.avgInterval} օրը մեկ, իսկ վերջին գնումից անցել է {customer.daysSince} օր։
                    </p>
                  )}
                  {hasMoney(customer.overdue) && (
                    <p>
                      ⚠ Ժամկետանց պարտք՝ {moneyText(customer.overdue, formatAmount)}, ուշացումը՝ {customer.overdueDays} օր։
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Վաճառք" value={formatAmount(customer.total)} hint={`վերջին ${periodLabel}`} />
                <Stat
                  label="Վերջին գնում"
                  value={customer.lastDate ? formatDisplayDate(customer.lastDate) : "—"}
                  hint={<SinceBadge days={customer.daysSince} />}
                />
                <Stat
                  label="Որքան հաճախ"
                  value={customer.avgInterval !== null ? `${customer.avgInterval} օրը մեկ` : "—"}
                  hint={`${customer.purchaseDays} գնման օր`}
                />
                <Stat
                  label="Միջին գնում"
                  value={customer.purchaseDays > 0 ? formatAmount(Math.round(customer.total / customer.purchaseDays)) : "—"}
                  hint="մեկ օրվա գնման գումարը"
                />
                <Stat label="Պարտք" value={moneyText(customer.debt, formatAmount)} hint="այսօրվա դրությամբ" />
                <Stat
                  label="Ժամկետանց"
                  value={moneyText(customer.overdue, formatAmount)}
                  hint={customer.overdueDays > 0 ? `${customer.overdueDays} օր ուշացում` : undefined}
                />
              </div>

              <div className={`${cardClass} space-y-3`}>
                <h3 className="font-semibold text-foreground">Վաճառք ըստ ամիսների</h3>
                <div className="overflow-x-auto">
                  <div className="flex h-40 min-w-[20rem] items-end gap-1.5">
                    {months.map((m) => (
                      <div key={m.month} className="flex h-full flex-1 flex-col justify-end">
                        <div className="flex h-full items-end justify-center">
                          <div
                            title={`${monthLabel(m.month)}: ${formatAmount(m.value)}`}
                            className="w-full max-w-[2rem] rounded-t-sm bg-primary"
                            style={{ height: `${m.value > 0 ? Math.max((m.value / max) * 100, 2) : 0}%` }}
                          />
                        </div>
                        <div className="mt-1 text-center text-[10px] text-muted-foreground">
                          {MONTHS[Number(m.month.slice(5)) - 1]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Items name={name} source={source} />

              <div className={`${cardClass} space-y-2`}>
                <h3 className="font-semibold text-foreground">Վերջին գնումները</h3>
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Գնումներ չկան</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {recent.map((d) => (
                      <li key={d.date} className="flex justify-between gap-3 py-1.5">
                        <span className="text-muted-foreground">{formatDisplayDate(d.date)}</span>
                        <span className="font-semibold tabular-nums">{formatAmount(d.value)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function CustomerCardClient() {
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const days = PERIODS.some((p) => String(p.days) === params.get("days")) ? Number(params.get("days")) : 180;

  return (
    <AuthGuard section="reports">
      <CardView name={name} days={days} />
    </AuthGuard>
  );
}
