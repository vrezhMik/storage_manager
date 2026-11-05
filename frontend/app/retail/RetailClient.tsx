"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import AuthGuard from "../components/AuthGuard";
import { API_BASE, authFetch } from "../lib/auth";
import { formatDisplayDate } from "../reports/components/DateRangeModal";
import { formatAmount, toNumber } from "../reports/sales/salesData";

// 1C returns { Date, Stores: [{ Магазин, Продажи, План }] }: per store, sales
// from the 1st of the month up to Date and the plan for the whole month.
// A single total without stores ({ Продажи, План }) works too.
type StoreRow = {
  Магазин?: string;
  Склад?: string;
  Продажи?: number | string;
  План?: number | string;
};
// Plans per brand group (one or several brands share one plan).
type BrandRow = {
  Магазин?: string;
  Группа?: string;
  // Each brand with its own sales; older 1C code sends just the names.
  Бренды?: ({ Бренд?: string; Продажи?: number | string } | string)[];
  Продажи?: number | string;
  План?: number | string;
};
export type RetailPlanData = {
  Date?: string;
  Stores?: StoreRow[];
  Brands?: BrandRow[];
  // Brands put in more than one group: their sales are counted twice.
  BrandWarning?: string[];
  Продажи?: number | string;
  План?: number | string;
  // "200" when fine; "Store not found" when the user's store is not in 1C.
  ErrorMessage?: string;
};

type Store = { name: string; sales: number; plan: number };

const MONTHS = ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս", "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"];
const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const percent = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";

// How far through the month the date is: day 5 of 30 -> 16.7 %.
export const monthProgress = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return { day: d, days, share: d / days, label: `${MONTHS[m - 1]} ${y}` };
};

export const readStores = (data: RetailPlanData | null): Store[] => {
  if (!data) return [];
  if (Array.isArray(data.Stores) && data.Stores.length > 0) {
    return data.Stores.map((row) => ({
      name: String(row.Магазин ?? row.Склад ?? "").trim() || "—",
      sales: toNumber(row.Продажи),
      plan: toNumber(row.План),
    }));
  }
  if (data.Продажи !== undefined || data.План !== undefined) {
    return [{ name: "Ընդամենը", sales: toNumber(data.Продажи), plan: toNumber(data.План) }];
  }
  return [];
};

type Brand = { name: string; sales: number | null };
type BrandGroup = { store: string; name: string; brands: Brand[]; sales: number; plan: number };

export const readBrands = (data: RetailPlanData | null): BrandGroup[] =>
  (data?.Brands ?? []).map((row) => ({
    store: String(row.Магазин ?? "").trim() || "—",
    name: String(row.Группа ?? "").trim() || "—",
    brands: Array.isArray(row.Бренды)
      ? row.Бренды.map((b) =>
          typeof b === "string"
            ? { name: b, sales: null }
            : { name: String(b?.Бренд ?? "").trim() || "—", sales: b?.Продажи === undefined ? null : toNumber(b.Продажи) },
        )
      : [],
    sales: toNumber(row.Продажи),
    plan: toNumber(row.План),
  }));

// Green: on pace or better; amber: a little behind; red: clearly behind.
const paceColor = (done: number, expected: number) => {
  if (done >= 1 || done >= expected) return { bar: "bg-green-600", text: "text-green-700" };
  if (done >= expected * 0.9) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-red-600", text: "text-red-700" };
};

function ProgressBar({ done, expected, tall }: { done: number; expected: number; tall?: boolean }) {
  const color = paceColor(done, expected);
  return (
    <div className={`relative rounded-full bg-muted ${tall ? "h-4" : "h-2.5"}`}>
      <div
        className={`rounded-full ${color.bar} ${tall ? "h-4" : "h-2.5"}`}
        style={{ width: `${Math.min(done, 1) * 100}%` }}
      />
      {/* Where the sales should be today if they were spread evenly over the month. */}
      <div
        className="absolute -top-1 -bottom-1 w-0.5 rounded bg-neutral-700"
        style={{ left: `${Math.min(expected, 1) * 100}%` }}
        title={`Այսօրվա նախատեսված՝ ${percent(expected * 100)}`}
      />
    </div>
  );
}

function Kpi({ label, value, hint, className = "" }: { label: string; value: string; hint?: ReactNode; className?: string }) {
  return (
    <div className={`${cardClass} space-y-1`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums text-foreground ${className}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

type ViewProps = {
  date: string;
  onDateChange: (date: string) => void;
  data: RetailPlanData | null;
  loading: boolean;
  error: string | null;
};

// Presentation only, so it can be rendered without the API.
export function RetailView({ date, onDateChange, data, loading, error }: ViewProps) {
  const stores = useMemo(() => readStores(data).sort((a, b) => b.sales - a.sales), [data]);
  const month = monthProgress(date);
  const sales = stores.reduce((s, x) => s + x.sales, 0);
  const plan = stores.reduce((s, x) => s + x.plan, 0);
  const done = plan > 0 ? sales / plan : 0;
  const color = paceColor(done, month.share);
  const forecast = month.day > 0 ? (sales / month.day) * month.days : 0;
  const daysLeft = month.days - month.day;
  const perDayNeeded = daysLeft > 0 && plan > sales ? (plan - sales) / daysLeft : 0;

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Մանրածախ
                {/* A store user sees one store: show its name. */}
                {stores.length === 1 && data?.Stores?.length ? (
                  <span className="text-[#cfb40b]"> · {stores[0].name}</span>
                ) : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                Պլանի կատարում · {month.label} · {formatDisplayDate(date)} դրությամբ
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
          ) : data?.ErrorMessage === "Store not found" ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">
                Ձեր խանութը 1C-ում չգտնվեց։ Ադմինկայում ստուգեք խանութի անունը. այն պետք է լինի ճիշտ այնպես, ինչպես 1C-ում է։
              </p>
            </div>
          ) : stores.length === 0 ? (
            <div className={cardClass}>
              <p className="text-sm text-muted-foreground">Այս ամսվա համար տվյալներ չկան</p>
            </div>
          ) : (
            <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
              <div className="grid gap-4 md:grid-cols-3">
                <Kpi label="Վաճառք ամսվա սկզբից" value={formatAmount(sales)} hint={`${month.day} օր ${month.days}-ից`} />
                <Kpi label="Ամսվա պլան" value={plan > 0 ? formatAmount(plan) : "—"} hint={plan > 0 ? undefined : "Պլանը նշված չէ"} />
                <Kpi
                  label="Կատարում"
                  value={plan > 0 ? percent(done * 100) : "—"}
                  className={plan > 0 ? color.text : ""}
                  hint={plan > 0 ? `Այսօրվա նախատեսված՝ ${percent(month.share * 100)}` : undefined}
                />
              </div>

              {plan > 0 && (
                <div className={`${cardClass} space-y-3`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-foreground">Ամսվա ընթացքը</h3>
                    <span className={`text-sm font-semibold ${color.text}`}>
                      {done >= 1
                        ? "Պլանը կատարված է"
                        : done >= month.share
                          ? "Առաջ է գրաֆիկից"
                          : `Հետ է մնում գրաֆիկից ${formatAmount(Math.round(plan * month.share - sales))}-ով`}
                    </span>
                  </div>
                  <ProgressBar done={done} expected={month.share} tall />
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <div className="text-muted-foreground">Կանխատեսում ամսվա վերջին</div>
                      <div className="font-semibold tabular-nums">
                        {formatAmount(Math.round(forecast))} ({percent((forecast / plan) * 100)})
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Պլանին հասնելու համար օրական</div>
                      <div className="font-semibold tabular-nums">
                        {done >= 1 ? "—" : daysLeft > 0 ? formatAmount(Math.round(perDayNeeded)) : "Ամիսն ավարտվել է"}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ուղղահայաց գիծը ցույց է տալիս, թե որքան պետք է լիներ կատարումը այսօր, եթե պլանը բաշխվեր ամսվա օրերի վրա հավասարաչափ։
                  </p>
                </div>
              )}

              {stores.length > 1 && (
                <div className={`${cardClass} space-y-3`}>
                  <h3 className="font-semibold text-foreground">Ըստ խանութների</h3>
                  <ul className="space-y-4">
                    {stores.map((store) => {
                      const storeDone = store.plan > 0 ? store.sales / store.plan : 0;
                      const storeColor = paceColor(storeDone, month.share);
                      return (
                        <li key={store.name} className="space-y-1.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                            <span className="font-medium text-foreground break-words">{store.name}</span>
                            <span className="tabular-nums">
                              <span className="font-semibold">{formatAmount(store.sales)}</span>
                              <span className="text-muted-foreground"> / {store.plan > 0 ? formatAmount(store.plan) : "պլան չկա"}</span>
                              {store.plan > 0 && (
                                <span className={`ml-2 font-semibold ${storeColor.text}`}>{percent(storeDone * 100)}</span>
                              )}
                            </span>
                          </div>
                          {store.plan > 0 && <ProgressBar done={storeDone} expected={month.share} />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <BrandPlans groups={readBrands(data)} expected={month.share} showStore={stores.length > 1} warning={data?.BrandWarning} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Brand group plans; the groups furthest behind pace come first, so the
// store sees right away which brands need work.
function BrandPlans({
  groups,
  expected,
  showStore,
  warning,
}: {
  groups: BrandGroup[];
  expected: number;
  showStore: boolean;
  warning?: string[];
}) {
  if (groups.length === 0) return null;
  const done = (g: BrandGroup) => (g.plan > 0 ? g.sales / g.plan : 0);
  const sorted = [...groups].sort((a, b) => done(a) - done(b));

  return (
    <div className={`${cardClass} space-y-3`}>
      <h3 className="font-semibold text-foreground">Պլան ըստ բրենդների</h3>
      {warning && warning.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ Այս բրենդները մեկից ավելի խմբում են, նրանց վաճառքը հաշվվում է կրկնակի՝ {warning.join(", ")}։
        </p>
      )}
      <ul className="space-y-4">
        {sorted.map((g) => (
          <BrandGroupRow key={`${g.store}::${g.name}`} group={g} expected={expected} showStore={showStore} />
        ))}
      </ul>
    </div>
  );
}

// One brand group; tapping a brand shows that brand's own sales.
function BrandGroupRow({ group: g, expected, showStore }: { group: BrandGroup; expected: number; showStore: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const gDone = g.plan > 0 ? g.sales / g.plan : 0;
  const gColor = paceColor(gDone, expected);
  const brand = g.brands.find((b) => b.name === selected);
  // A group of one brand named like the group: the chip would only repeat the name.
  const showChips = g.brands.length > 0 && !(g.brands.length === 1 && g.brands[0].name === g.name);

  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="min-w-0 font-medium text-foreground break-words">
          {g.name}
          {showStore && <span className="ml-2 text-xs font-normal text-muted-foreground">{g.store}</span>}
        </span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatAmount(g.sales)}</span>
          <span className="text-muted-foreground"> / {formatAmount(g.plan)}</span>
          <span className={`ml-2 font-semibold ${gColor.text}`}>{g.plan > 0 ? percent(gDone * 100) : "—"}</span>
        </span>
      </div>
      {showChips && (
        <div className="flex flex-wrap gap-1">
          {g.brands.map((b) => {
            const active = b.name === selected;
            const clickable = b.sales !== null;
            return (
              <button
                key={b.name}
                type="button"
                disabled={!clickable}
                onClick={() => setSelected(active ? null : b.name)}
                aria-pressed={active}
                className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                  active
                    ? "bg-[#00613C] font-medium text-white"
                    : "bg-muted text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground"
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      )}
      {brand && brand.sales !== null && (
        <div className="rounded-md bg-muted/60 px-3 py-1.5 text-sm">
          <span className="font-medium">{brand.name}</span>
          <span className="text-muted-foreground">՝ </span>
          <span className="font-semibold tabular-nums">{formatAmount(brand.sales)}</span>
          {g.sales > 0 && (
            <span className="text-xs text-muted-foreground"> · խմբի վաճառքի {percent((brand.sales / g.sales) * 100)}</span>
          )}
        </div>
      )}
      {g.plan > 0 && <ProgressBar done={gDone} expected={expected} />}
    </li>
  );
}

export default function RetailClient() {
  const [date, setDate] = useState(today);
  const [data, setData] = useState<RetailPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    authFetch<RetailPlanData>(`${API_BASE}/retail-plan?date=${date}`, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setData(res ?? {});
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Retail plan failed", err);
        setError("Չհաջողվեց ստանալ տվյալները");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date]);

  return (
    <AuthGuard section="retail">
      <RetailView date={date} onDateChange={setDate} data={data} loading={loading} error={error} />
    </AuthGuard>
  );
}
