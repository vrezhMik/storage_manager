"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import AuthGuard from "../../components/AuthGuard";
import { API_BASE, authFetch } from "../../lib/auth";
import { formatAmount, toNumber } from "../sales/salesData";

// 1C returns { Sales: [{ Месяц: "yyyy-MM", Склад, Менеджер, Партнер, Номенклатура, Сумма }] }
// for the requested Datestart..Date. Which of Склад / Менеджер / Партнер / Номенклатура
// are filled depends on GroupBy (none, Manager, Partner, Item).
export type MonthlyRow = {
  Месяц?: string;
  Период?: string;
  Склад?: string;
  Менеджер?: string;
  Партнер?: string;
  Номенклатура?: string;
  Сумма?: number | string;
};
export type MonthlyData = { Sales?: MonthlyRow[] };

export type Mode = "total" | "manager" | "partner" | "item";

const MODES: { mode: Mode; label: string; groupLabel: string }[] = [
  { mode: "total", label: "Ընդհանուր", groupLabel: "" },
  { mode: "manager", label: "Ըստ մենեջերի", groupLabel: "Մենեջեր / Գործընկեր" },
  { mode: "partner", label: "Ըստ գործընկերների", groupLabel: "Գործընկեր" },
  { mode: "item", label: "Ըստ ապրանքների", groupLabel: "Ապրանք" },
];

const ITEM_LIMIT = 50;

const text = (value: unknown, fallback: string) => String(value ?? "").trim() || fallback;

const groupOf = (row: MonthlyRow, mode: Mode) => {
  if (mode === "manager") return text(row.Менеджер, "Առանց մենեջերի");
  if (mode === "partner") return text(row.Партнер, "—");
  if (mode === "item") return text(row.Номенклатура, "—");
  return "";
};

// Second level, only used by the manager view (manager -> partners).
const subOf = (row: MonthlyRow, mode: Mode) => (mode === "manager" ? text(row.Партнер, "—") : "");

type Selection = { group: string; sub: string | null } | null;

export type MonthRange = { from: string; to: string }; // "yyyy-MM"

const MONTH_NAMES = ["Հնվ", "Փտր", "Մրտ", "Ապր", "Մյս", "Հնս", "Հլս", "Օգս", "Սեպ", "Հոկ", "Նոյ", "Դեկ"];
const MAX_MONTHS = 24;
const ALL_WAREHOUSES = "";

const pad = (n: number) => String(n).padStart(2, "0");
const monthIndex = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
const fromIndex = (index: number) => `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
const shiftMonth = (ym: string, delta: number) => fromIndex(monthIndex(ym) + delta);
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
const monthsOf = ({ from, to }: MonthRange) =>
  Array.from({ length: monthIndex(to) - monthIndex(from) + 1 }, (_, i) => shiftMonth(from, i));

export const rangeToDates = ({ from, to }: MonthRange) => {
  const [y, m] = to.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${from}-01`, end: `${to}-${pad(lastDay)}` };
};

export const isValidRange = (r: MonthRange) =>
  /^\d{4}-\d{2}$/.test(r.from) &&
  /^\d{4}-\d{2}$/.test(r.to) &&
  monthIndex(r.from) <= monthIndex(r.to) &&
  monthIndex(r.to) - monthIndex(r.from) < MAX_MONTHS;

export const defaultRanges = (): [MonthRange, MonthRange] => {
  const to = currentMonth();
  const first = { from: shiftMonth(to, -11), to };
  return [first, { from: shiftMonth(first.from, -12), to: shiftMonth(to, -12) }];
};

const rowMonth = (row: MonthlyRow) => String(row.Месяц ?? row.Период ?? "").slice(0, 7);

const matches = (row: MonthlyRow, warehouse: string, mode: Mode, selection: Selection) => {
  if (warehouse !== ALL_WAREHOUSES && String(row.Склад ?? "").trim() !== warehouse) return false;
  if (!selection) return true;
  if (groupOf(row, mode) !== selection.group) return false;
  return selection.sub === null || subOf(row, mode) === selection.sub;
};

const sumByMonth = (rows: MonthlyRow[], warehouse: string, mode: Mode, selection: Selection) => {
  const sums = new Map<string, number>();
  rows.forEach((row) => {
    if (!matches(row, warehouse, mode, selection)) return;
    const month = rowMonth(row);
    sums.set(month, (sums.get(month) ?? 0) + toNumber(row.Сумма));
  });
  return sums;
};

const changeText = (current: number, base: number) => {
  if (base === 0) return null;
  const change = ((current - base) / base) * 100;
  return { up: change >= 0, text: `${Math.abs(change).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` };
};

function Change({ current, base }: { current: number; base: number }) {
  const change = changeText(current, base);
  if (!change) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`font-semibold ${change.up ? "text-green-600" : "text-red-600"}`}>
      {change.up ? "▲" : "▼"} {change.text}
    </span>
  );
}

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";
const inputClass =
  "rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const thClass = "border border-border px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap";
const tdClass = "border border-border px-3 py-2 text-sm text-right whitespace-nowrap tabular-nums";

const PERIOD_COLORS = ["bg-primary", "bg-[#cfb40b]"];

function RangePicker({
  label,
  color,
  range,
  onChange,
}: {
  label: string;
  color: string;
  range: MonthRange;
  onChange: (range: MonthRange) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className={`inline-block h-3 w-3 rounded-sm ${color}`} />
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={range.from}
          max={range.to}
          onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })}
          className={inputClass}
          aria-label={`${label}, սկիզբ`}
        />
        <span className="text-muted-foreground">—</span>
        <input
          type="month"
          value={range.to}
          min={range.from}
          onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })}
          className={inputClass}
          aria-label={`${label}, վերջ`}
        />
      </div>
    </div>
  );
}

type GroupTotals = { name: string; value1: number; value2: number; subs: GroupTotals[] };

const buildGroupTotals = (
  data: [MonthlyData | null, MonthlyData | null],
  ranges: [MonthRange, MonthRange],
  warehouse: string,
  mode: Mode,
): GroupTotals[] => {
  const groups = new Map<string, { value1: number; value2: number; subs: Map<string, [number, number]> }>();
  data.forEach((d, period) => {
    const months = new Set(monthsOf(ranges[period]));
    (d?.Sales ?? []).forEach((row) => {
      if (!matches(row, warehouse, mode, null) || !months.has(rowMonth(row))) return;
      const amount = toNumber(row.Сумма);
      const name = groupOf(row, mode);
      const group = groups.get(name) ?? { value1: 0, value2: 0, subs: new Map() };
      if (period === 0) group.value1 += amount;
      else group.value2 += amount;
      const sub = subOf(row, mode);
      if (sub) {
        const values = group.subs.get(sub) ?? [0, 0];
        values[period] += amount;
        group.subs.set(sub, values);
      }
      groups.set(name, group);
    });
  });
  const order = (a: GroupTotals, b: GroupTotals) => b.value1 - a.value1 || b.value2 - a.value2 || a.name.localeCompare(b.name);
  return Array.from(groups, ([name, g]) => ({
    name,
    value1: g.value1,
    value2: g.value2,
    subs: Array.from(g.subs, ([subName, [value1, value2]]) => ({ name: subName, value1, value2, subs: [] })).sort(order),
  })).sort(order);
};

function GroupTable({
  groups,
  mode,
  selection,
  onSelect,
}: {
  groups: GroupTotals[];
  mode: Mode;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const visible = mode === "item" && !showAll ? groups.slice(0, ITEM_LIMIT) : groups;
  const groupLabel = MODES.find((m) => m.mode === mode)?.groupLabel ?? "";

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const isSelected = (group: string, sub: string | null) =>
    selection?.group === group && selection.sub === sub;

  const row = (item: GroupTotals, group: string, sub: string | null, depth: number) => (
    <tr key={`${group}::${sub ?? ""}`} className={isSelected(group, sub) ? "bg-primary/10" : depth === 0 && mode === "manager" ? "bg-muted/30" : ""}>
      <th
        scope="row"
        className={`${thClass} sticky left-0 z-10 text-left max-w-[16rem] whitespace-normal ${
          isSelected(group, sub) ? "bg-primary/10" : depth === 0 && mode === "manager" ? "bg-muted" : "bg-card"
        } ${depth > 0 ? "pl-10 font-normal" : "font-semibold"} text-foreground`}
      >
        <span className="inline-flex items-center gap-2">
          {depth === 0 && mode === "manager" && (
            <button
              type="button"
              onClick={() => toggle(group)}
              aria-expanded={expanded.has(group)}
              aria-label={expanded.has(group) ? "Փակել" : "Բացել"}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-input bg-background text-sm leading-none"
            >
              {expanded.has(group) ? "−" : "+"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelect(isSelected(group, sub) ? null : { group, sub })}
            className="text-left hover:underline"
            title="Ցույց տալ գրաֆիկում"
          >
            {item.name}
          </button>
        </span>
      </th>
      <td className={`${tdClass} font-semibold`}>{formatAmount(item.value1)}</td>
      <td className={tdClass}>{formatAmount(item.value2)}</td>
      <td className={tdClass}>
        {item.value1 - item.value2 >= 0 ? "+" : "−"}
        {formatAmount(Math.abs(item.value1 - item.value2))}
      </td>
      <td className={tdClass}>
        <Change current={item.value1} base={item.value2} />
      </td>
    </tr>
  );

  return (
    <div className={`${cardClass} space-y-2`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">{MODES.find((m) => m.mode === mode)?.label}</h3>
        <span className="text-xs text-muted-foreground">Սեղմեք անվան վրա՝ գրաֆիկում տեսնելու համար</span>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className={`${thClass} sticky left-0 z-10 bg-card text-left`}>{groupLabel}</th>
                <th className={`${thClass} text-right`}>Վաճառք 1</th>
                <th className={`${thClass} text-right`}>Վաճառք 2</th>
                <th className={`${thClass} text-right`}>Տարբերություն</th>
                <th className={`${thClass} text-right`}>Փոփոխություն</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((group) => (
                <Fragment key={group.name}>
                  {row(group, group.name, null, 0)}
                  {mode === "manager" &&
                    expanded.has(group.name) &&
                    group.subs.map((sub) => row(sub, group.name, sub.name, 1))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mode === "item" && groups.length > ITEM_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {showAll ? `Ցույց տալ առաջին ${ITEM_LIMIT}-ը` : `Ցույց տալ բոլոր ${groups.length} ապրանքները`}
        </button>
      )}
    </div>
  );
}

type ViewProps = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  ranges: [MonthRange, MonthRange];
  onRangesChange: (ranges: [MonthRange, MonthRange]) => void;
  data: [MonthlyData | null, MonthlyData | null];
  loading: boolean;
  error: string | null;
};

// Presentation only, so it can be rendered without the API.
export function SalesMonthlyView({ mode, onModeChange, ranges, onRangesChange, data, loading, error }: ViewProps) {
  const [warehouse, setWarehouse] = useState(ALL_WAREHOUSES);
  const [selection, setSelection] = useState<Selection>(null);
  const [first, second] = ranges;

  // A selected manager / partner / item only makes sense for the data it came from.
  useEffect(() => setSelection(null), [mode, data]);

  const groups = useMemo(
    () => (mode === "total" ? [] : buildGroupTotals(data, ranges, warehouse, mode)),
    [data, ranges, warehouse, mode],
  );

  const warehouses = useMemo(() => {
    const names = new Set<string>();
    data.forEach((d) => (d?.Sales ?? []).forEach((r) => r.Склад && names.add(String(r.Склад).trim())));
    return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const pairs = useMemo(() => {
    const sums = data.map((d) => sumByMonth(d?.Sales ?? [], warehouse, mode, selection));
    const months1 = monthsOf(first);
    const months2 = monthsOf(second);
    return Array.from({ length: Math.max(months1.length, months2.length) }, (_, i) => ({
      month1: months1[i] ?? null,
      month2: months2[i] ?? null,
      value1: months1[i] ? sums[0].get(months1[i]) ?? 0 : null,
      value2: months2[i] ? sums[1].get(months2[i]) ?? 0 : null,
    }));
  }, [data, warehouse, first, second, mode, selection]);

  const total1 = pairs.reduce((sum, p) => sum + (p.value1 ?? 0), 0);
  const total2 = pairs.reduce((sum, p) => sum + (p.value2 ?? 0), 0);
  const max = Math.max(...pairs.map((p) => Math.max(p.value1 ?? 0, p.value2 ?? 0)), 0);

  const setFirst = (range: MonthRange) => onRangesChange([range, second]);
  const setSecond = (range: MonthRange) => onRangesChange([first, range]);
  const length = monthIndex(first.to) - monthIndex(first.from) + 1;

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} space-y-4`}>
            <h2 className="text-xl font-semibold text-foreground">Վաճառքի դինամիկա</h2>
            <div role="tablist" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.mode}
                  onClick={() => onModeChange(m.mode)}
                  className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    mode === m.mode ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <RangePicker label="Ժամանակահատված 1" color={PERIOD_COLORS[0]} range={first} onChange={setFirst} />
              <RangePicker label="Ժամանակահատված 2" color={PERIOD_COLORS[1]} range={second} onChange={setSecond} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Համեմատել՝</span>
              <button
                type="button"
                onClick={() => setSecond({ from: shiftMonth(first.from, -12), to: shiftMonth(first.to, -12) })}
                className="rounded-full border border-input px-3 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Նախորդ տարվա նույն ամիսները
              </button>
              <button
                type="button"
                onClick={() => setSecond({ from: shiftMonth(first.from, -length), to: shiftMonth(first.from, -1) })}
                className="rounded-full border border-input px-3 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Նախորդ ժամանակահատվածը
              </button>
              {warehouses.length > 0 && (
                <select
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  className={`${inputClass} ml-auto`}
                  aria-label="Պահեստ"
                >
                  <option value={ALL_WAREHOUSES}>Բոլոր պահեստները</option>
                  {warehouses.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {(!isValidRange(first) || !isValidRange(second)) && (
              <p className="text-xs text-red-600">
                Ամեն ժամանակահատված պետք է լինի մինչև {MAX_MONTHS} ամիս, և սկիզբը չպետք է լինի վերջից հետո
              </p>
            )}
          </div>

          {error ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : loading && !data[0] ? (
            <div className={`${cardClass} space-y-2`}>
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-24 rounded bg-muted animate-pulse" />
            </div>
          ) : (
            <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
              <div className="grid gap-4 grid-cols-3">
                <div className={`${cardClass} space-y-1`}>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={`inline-block h-3 w-3 rounded-sm ${PERIOD_COLORS[0]}`} />
                    Ժամանակահատված 1
                  </div>
                  <div className="text-xl font-bold text-foreground tabular-nums">{formatAmount(total1)}</div>
                </div>
                <div className={`${cardClass} space-y-1`}>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={`inline-block h-3 w-3 rounded-sm ${PERIOD_COLORS[1]}`} />
                    Ժամանակահատված 2
                  </div>
                  <div className="text-xl font-bold text-foreground tabular-nums">{formatAmount(total2)}</div>
                </div>
                <div className={`${cardClass} space-y-1`}>
                  <div className="text-sm text-muted-foreground">Փոփոխություն</div>
                  <div className="text-xl tabular-nums">
                    <Change current={total1} base={total2} />
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {total1 - total2 >= 0 ? "+" : "−"}
                    {formatAmount(Math.abs(total1 - total2))}
                  </div>
                </div>
              </div>

              <div className={`${cardClass} space-y-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-foreground">
                    Ըստ ամիսների
                    {selection && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {selection.sub ? `${selection.group} / ${selection.sub}` : selection.group}
                      </span>
                    )}
                  </h3>
                  {selection && (
                    <button
                      type="button"
                      onClick={() => setSelection(null)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Ցույց տալ ընդհանուրը
                    </button>
                  )}
                </div>
                {max === 0 ? (
                  <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex h-48 min-w-[32rem] items-end gap-2">
                      {pairs.map((p, i) => (
                        <div key={i} className="flex h-full flex-1 flex-col justify-end">
                          <div className="flex h-full items-end justify-center gap-[2px]">
                            {[p.value1, p.value2].map((value, j) => (
                              <div
                                key={j}
                                title={`${(j === 0 ? p.month1 : p.month2) ? monthLabel((j === 0 ? p.month1 : p.month2)!) : ""}: ${formatAmount(value ?? 0)}`}
                                className={`w-1/2 max-w-[1.25rem] rounded-t-sm ${PERIOD_COLORS[j]}`}
                                style={{ height: `${value ? Math.max((value / max) * 100, 2) : 0}%` }}
                              />
                            ))}
                          </div>
                          <div className="mt-1 text-center text-[10px] text-muted-foreground">
                            {p.month1 ? MONTH_NAMES[Number(p.month1.slice(5)) - 1] : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={`${cardClass} overflow-x-auto`}>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={`${thClass} text-left`}>Ամիս 1</th>
                      <th className={`${thClass} text-right`}>Վաճառք 1</th>
                      <th className={`${thClass} text-left`}>Ամիս 2</th>
                      <th className={`${thClass} text-right`}>Վաճառք 2</th>
                      <th className={`${thClass} text-right`}>Տարբերություն</th>
                      <th className={`${thClass} text-right`}>Փոփոխություն</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map((p, i) => (
                      <tr key={i}>
                        <td className={`${tdClass} text-left`}>{p.month1 ? monthLabel(p.month1) : "—"}</td>
                        <td className={`${tdClass} font-semibold`}>
                          {p.value1 === null ? "—" : formatAmount(p.value1)}
                        </td>
                        <td className={`${tdClass} text-left text-muted-foreground`}>
                          {p.month2 ? monthLabel(p.month2) : "—"}
                        </td>
                        <td className={tdClass}>{p.value2 === null ? "—" : formatAmount(p.value2)}</td>
                        <td className={tdClass}>
                          {p.value1 === null || p.value2 === null
                            ? "—"
                            : `${p.value1 - p.value2 >= 0 ? "+" : "−"}${formatAmount(Math.abs(p.value1 - p.value2))}`}
                        </td>
                        <td className={tdClass}>
                          {p.value1 === null || p.value2 === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Change current={p.value1} base={p.value2} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50">
                      <th className={`${thClass} text-left text-foreground`}>Ընդամենը</th>
                      <td className={`${tdClass} font-bold`}>{formatAmount(total1)}</td>
                      <td className={tdClass} />
                      <td className={`${tdClass} font-semibold`}>{formatAmount(total2)}</td>
                      <td className={`${tdClass} font-semibold`}>
                        {total1 - total2 >= 0 ? "+" : "−"}
                        {formatAmount(Math.abs(total1 - total2))}
                      </td>
                      <td className={tdClass}>
                        <Change current={total1} base={total2} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {mode !== "total" && (
                <GroupTable groups={groups} mode={mode} selection={selection} onSelect={setSelection} />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const fetchRange = (range: MonthRange, mode: Mode, signal: AbortSignal) => {
  const { start, end } = rangeToDates(range);
  const group = mode === "total" ? "" : `&group=${mode}`;
  return authFetch<MonthlyData>(`${API_BASE}/sales-monthly?start=${start}&end=${end}${group}`, { signal });
};

export default function SalesMonthlyClient() {
  const [mode, setMode] = useState<Mode>("total");
  const [ranges, setRanges] = useState<[MonthRange, MonthRange]>(defaultRanges);
  const [data, setData] = useState<[MonthlyData | null, MonthlyData | null]>([null, null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedMode = useRef<Mode | null>(null);

  useEffect(() => {
    if (!isValidRange(ranges[0]) || !isValidRange(ranges[1])) return;
    const controller = new AbortController();
    // Data of another mode is grouped differently, so don't show it while loading.
    if (loadedMode.current !== mode) setData([null, null]);
    setLoading(true);
    setError(null);
    Promise.all(ranges.map((range) => fetchRange(range, mode, controller.signal)))
      .then(([first, second]) => {
        if (controller.signal.aborted) return;
        loadedMode.current = mode;
        setData([first ?? {}, second ?? {}]);
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        console.error("Monthly sales failed", err);
        setError("Չհաջողվեց ստանալ տվյալները");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ranges, mode]);

  return (
    <AuthGuard section="reports">
      <SalesMonthlyView
        mode={mode}
        onModeChange={setMode}
        ranges={ranges}
        onRangesChange={setRanges}
        data={data}
        loading={loading}
        error={error}
      />
    </AuthGuard>
  );
}
