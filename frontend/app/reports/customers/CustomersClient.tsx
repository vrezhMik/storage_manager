"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import ExcelButton from "../../components/ExcelButton";
import { downloadXlsx } from "../../lib/excel";
import { formatDisplayDate } from "../components/DateRangeModal";
import { formatAmount, tdClass, thClass } from "../sales/salesData";
import {
  buildCustomers,
  Customer,
  CustomerSource,
  customerHref,
  hasMoney,
  isInactive,
  isLate,
  loadCustomerSource,
  moneyText,
  PERIODS,
} from "./customerData";

type Filter = "all" | "inactive30" | "inactive60" | "inactive90" | "late" | "overdue";

const FILTERS: { filter: Filter; label: string; test: (c: Customer) => boolean }[] = [
  { filter: "all", label: "Բոլորը", test: () => true },
  { filter: "inactive30", label: "30+ օր չեն գնել", test: (c) => isInactive(c, 30) },
  { filter: "inactive60", label: "60+ օր չեն գնել", test: (c) => isInactive(c, 60) },
  { filter: "inactive90", label: "90+ օր չեն գնել", test: (c) => isInactive(c, 90) },
  { filter: "late", label: "Ուշանում են սովորականից", test: isLate },
  { filter: "overdue", label: "Ժամկետանց պարտքով", test: (c) => hasMoney(c.overdue) },
];

const PAGE = 100;
const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";
const inputClass =
  "rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function SinceBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">գնում չկա</span>;
  }
  const cls =
    days > 30 ? "bg-red-100 text-red-800" : days > 14 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>
      {days === 0 ? "այսօր" : `${days} օր առաջ`}
    </span>
  );
}

const exportCustomers = (list: Customer[], source: CustomerSource, filterLabel: string) => {
  const period = `${formatDisplayDate(source.range.start)} – ${formatDisplayDate(source.range.end)}`;
  return downloadXlsx(`Հաճախորդներ ${period}`, [
    {
      name: "Հաճախորդներ",
      title: ["Հաճախորդներ", `${period} · ${filterLabel}`],
      columns: [
        { header: "Հաճախորդ", width: 40 },
        { header: "Մենեջեր", width: 26 },
        { header: "Վաճառք", numeric: true },
        { header: "Գնումների օրեր", numeric: true, width: 14 },
        { header: "Վերջին գնում", width: 14 },
        { header: "Օր առանց գնման", numeric: true, width: 15 },
        { header: "Պարտք", width: 22 },
        { header: "Ժամկետանց", width: 22 },
      ],
      rows: list.map((c) => ({
        cells: [
          c.name,
          c.manager,
          c.total,
          c.purchaseDays,
          c.lastDate ? formatDisplayDate(c.lastDate) : "—",
          c.daysSince,
          moneyText(c.debt, formatAmount),
          moneyText(c.overdue, formatAmount),
        ],
      })),
      total: ["Ընդամենը", null, list.reduce((s, c) => s + c.total, 0), null, null, null, null, null],
    },
  ]);
};

export function CustomersView({
  days,
  filter,
  onChange,
}: {
  days: number;
  filter: Filter;
  onChange: (days: number, filter: Filter) => void;
}) {
  const [source, setSource] = useState<CustomerSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadCustomerSource(days)
      .then((s) => alive && setSource(s))
      .catch((err) => {
        console.error("Customers failed", err);
        if (alive) setError("Չհաջողվեց ստանալ տվյալները");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  const customers = useMemo(() => (source ? buildCustomers(source) : []), [source]);
  const active = FILTERS.find((f) => f.filter === filter) ?? FILTERS[0];
  const needle = query.trim().toLowerCase();
  const list = customers.filter(
    (c) => active.test(c) && (!needle || c.name.toLowerCase().includes(needle) || c.manager.toLowerCase().includes(needle)),
  );

  const summary = [
    { label: "Հաճախորդներ", value: customers.length, filter: "all" as Filter },
    { label: "Գնել են վերջին 30 օրում", value: customers.filter((c) => !isInactive(c, 30)).length, filter: "all" as Filter },
    { label: "30+ օր չեն գնել", value: customers.filter((c) => isInactive(c, 30)).length, filter: "inactive30" as Filter },
    { label: "Ժամկետանց պարտքով", value: customers.filter((c) => hasMoney(c.overdue)).length, filter: "overdue" as Filter },
  ];

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Հաճախորդներ</h2>
                {source && (
                  <p className="text-sm text-muted-foreground">
                    Վաճառքը՝ {formatDisplayDate(source.range.start)} – {formatDisplayDate(source.range.end)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {PERIODS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => onChange(p.days, filter)}
                    aria-pressed={days === p.days}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      days === p.days ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {source && list.length > 0 && (
                  <ExcelButton onExport={() => exportCustomers(list, source, active.label)} />
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Որոնել հաճախորդ կամ մենեջեր"
                className={`${inputClass} flex-1`}
              />
              <select
                value={filter}
                onChange={(e) => onChange(days, e.target.value as Filter)}
                className={inputClass}
                aria-label="Ֆիլտր"
              >
                {FILTERS.map((f) => (
                  <option key={f.filter} value={f.filter}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {source && (source.debts === null || source.overdue === null) && (
              <p className="text-xs text-amber-700">
                Պարտքերի տվյալները չհաջողվեց ստանալ, ցույց է տրված միայն վաճառքը։
              </p>
            )}
          </div>

          {error ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : loading && !source ? (
            <div className={`${cardClass} space-y-2`}>
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          ) : (
            <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {summary.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onChange(days, s.filter)}
                    className="rounded-lg border bg-card p-3 text-left shadow-sm hover:shadow"
                  >
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-xl font-bold tabular-nums text-foreground">{s.value}</div>
                  </button>
                ))}
              </div>

              <div className={`${cardClass} space-y-3`}>
                <span className="text-sm text-muted-foreground">
                  {active.label}՝ {list.length}
                </span>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Հաճախորդներ չկան</p>
                ) : (
                  <>
                    <div className="space-y-2 md:hidden">
                      {list.slice(0, limit).map((c) => (
                        <Link
                          key={c.name}
                          href={customerHref(c.name, days) as Route}
                          className="block rounded-lg border border-border px-3 py-2.5 hover:bg-accent"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words text-sm font-semibold text-foreground">{c.name}</span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{formatAmount(c.total)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <SinceBadge days={c.daysSince} />
                            <span>{c.manager}</span>
                            {hasMoney(c.debt) && <span>Պարտք՝ {moneyText(c.debt, formatAmount)}</span>}
                            {hasMoney(c.overdue) && (
                              <span className="font-semibold text-red-700">
                                Ժամկետանց՝ {moneyText(c.overdue, formatAmount)}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto -mx-5 px-5">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr>
                            <th className={`${thClass} text-left`}>Հաճախորդ</th>
                            <th className={`${thClass} text-left`}>Մենեջեր</th>
                            <th className={`${thClass} text-right`}>Վաճառք</th>
                            <th className={`${thClass} text-right`}>Գնումների օրեր</th>
                            <th className={`${thClass} text-right`}>Վերջին գնում</th>
                            <th className={`${thClass} text-right`}>Պարտք</th>
                            <th className={`${thClass} text-right`}>Ժամկետանց</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.slice(0, limit).map((c) => (
                            <tr key={c.name} className="hover:bg-muted/40">
                              <td className={`${tdClass} text-left whitespace-normal min-w-[14rem]`}>
                                <Link href={customerHref(c.name, days) as Route} className="font-medium text-primary hover:underline">
                                  {c.name}
                                </Link>
                                {isLate(c) && (
                                  <span className="ml-2 text-xs text-amber-700">
                                    սովորաբար՝ {c.avgInterval} օրը մեկ
                                  </span>
                                )}
                              </td>
                              <td className={`${tdClass} text-left whitespace-normal text-muted-foreground`}>{c.manager}</td>
                              <td className={`${tdClass} font-semibold`}>{formatAmount(c.total)}</td>
                              <td className={tdClass}>{c.purchaseDays}</td>
                              <td className={tdClass}>
                                <span className="mr-2 text-muted-foreground">
                                  {c.lastDate ? formatDisplayDate(c.lastDate) : ""}
                                </span>
                                <SinceBadge days={c.daysSince} />
                              </td>
                              <td className={tdClass}>{moneyText(c.debt, formatAmount)}</td>
                              <td className={`${tdClass} ${hasMoney(c.overdue) ? "font-semibold text-red-700" : ""}`}>
                                {moneyText(c.overdue, formatAmount)}
                                {c.overdueDays > 0 && (
                                  <span className="ml-1 text-xs font-normal">({c.overdueDays} օր)</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {list.length > limit && (
                      <button
                        type="button"
                        onClick={() => setLimit((l) => l + PAGE)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Ցույց տալ ևս {Math.min(PAGE, list.length - limit)}
                      </button>
                    )}
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

export default function CustomersClient() {
  const router = useRouter();
  const params = useSearchParams();
  const days = PERIODS.some((p) => String(p.days) === params.get("days")) ? Number(params.get("days")) : 180;
  const filter = (FILTERS.some((f) => f.filter === params.get("filter")) ? params.get("filter") : "all") as Filter;

  return (
    <AuthGuard section="reports">
      <CustomersView
        days={days}
        filter={filter}
        onChange={(d, f) => router.replace(`/reports/customers/?days=${d}&filter=${f}` as Route)}
      />
    </AuthGuard>
  );
}
