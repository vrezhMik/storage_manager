"use client";

import { useMemo, useState } from "react";
import { formatAmount, tdClass, thClass, toNumber } from "../sales/salesData";
import { DateRange, formatDisplayDate } from "../components/DateRangeModal";
import ExcelButton from "../../components/ExcelButton";
import MobileRows from "../components/MobileRows";
import { downloadXlsx } from "../../lib/excel";

// 1C returns { Datestart, Date, Items: [{ Номенклатура, Количество, СуммаВыручки, Себестоимость }] }.
export type AbcRow = {
  Номенклатура?: string;
  Количество?: number | string;
  СуммаВыручки?: number | string;
  Себестоимость?: number | string;
};

const isAbcRow = (entry: unknown): entry is AbcRow =>
  Boolean(entry) && typeof entry === "object" && "СуммаВыручки" in (entry as object);

export const extractAbcRows = (data: unknown): AbcRow[] | null => {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as Record<string, unknown>).Items ??
        Object.values(data as Record<string, unknown>).find(Array.isArray)
      : undefined;
  if (!Array.isArray(list)) return null;
  if (list.length === 0) return [];
  return list.some(isAbcRow) ? list.filter(isAbcRow) : null;
};

type AbcClass = "A" | "B" | "C";

// A = first 80% of revenue, B = up to 95%, C = the rest.
const CLASS_LIMITS: [AbcClass, number][] = [
  ["A", 80],
  ["B", 95],
  ["C", 100],
];

const CLASS_STYLE: Record<AbcClass, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-amber-100 text-amber-800",
  C: "bg-red-100 text-red-800",
};

const CLASS_HINT: Record<AbcClass, string> = {
  A: "եկամտի 80%-ը",
  B: "հաջորդ 15%-ը",
  C: "վերջին 5%-ը",
};

type Item = {
  name: string;
  qty: number;
  revenue: number;
  cost: number | null;
  share: number;
  cumulative: number;
  abc: AbcClass;
};

const percent = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

const buildItems = (rows: AbcRow[]) => {
  const byName = new Map<string, { qty: number; revenue: number; cost: number | null }>();
  rows.forEach((row) => {
    const name = String(row.Номенклатура ?? "").trim() || "—";
    const prev = byName.get(name) ?? { qty: 0, revenue: 0, cost: null };
    const hasCost = row.Себестоимость !== undefined && row.Себестоимость !== null && row.Себестоимость !== "";
    byName.set(name, {
      qty: prev.qty + toNumber(row.Количество),
      revenue: prev.revenue + toNumber(row.СуммаВыручки),
      cost: hasCost ? (prev.cost ?? 0) + toNumber(row.Себестоимость) : prev.cost,
    });
  });

  const sorted = Array.from(byName, ([name, v]) => ({ name, ...v }))
    .filter((i) => i.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((sum, i) => sum + i.revenue, 0);

  let running = 0;
  const items: Item[] = sorted.map((i) => {
    // The class is decided by the cumulative share *before* this item, so the
    // item that crosses 80% still counts as A.
    const before = total > 0 ? (running / total) * 100 : 0;
    running += i.revenue;
    const share = total > 0 ? (i.revenue / total) * 100 : 0;
    const abc = CLASS_LIMITS.find(([, limit]) => before < limit)?.[0] ?? "C";
    return { ...i, share, cumulative: total > 0 ? (running / total) * 100 : 0, abc };
  });

  return { items, total };
};

// All items (not only the filtered class), in revenue order.
const exportAbc = (items: Item[], total: number, range?: DateRange) => {
  const period = range ? `${formatDisplayDate(range.start)} – ${formatDisplayDate(range.end)}` : "";
  const hasCost = items.some((i) => i.cost !== null);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return downloadXlsx(`Թոփ ապրանքներ ABC ${period}`, [
    {
      name: "ABC",
      title: ["Թոփ ապրանքներ (ABC)", period],
      columns: [
        { header: "#", width: 6, numeric: true },
        { header: "Ապրանք", width: 46 },
        { header: "Դաս", width: 7 },
        { header: "Քանակ", numeric: true, width: 12 },
        { header: "Եկամուտ", numeric: true },
        { header: "Մաս, %", numeric: true, width: 10 },
        { header: "Կուտակային, %", numeric: true, width: 14 },
        ...(hasCost ? [{ header: "Շահույթ", numeric: true }, { header: "Մարժա, %", numeric: true, width: 11 }] : []),
      ],
      rows: items.map((item, idx) => {
        const profit = item.cost === null ? null : item.revenue - item.cost;
        const margin = profit === null || item.revenue === 0 ? null : round1((profit / item.revenue) * 100);
        return {
          cells: [
            idx + 1,
            item.name,
            item.abc,
            item.qty,
            item.revenue,
            round1(item.share),
            round1(item.cumulative),
            ...(hasCost ? [profit, margin] : []),
          ],
        };
      }),
      total: [null, "Ընդամենը", null, null, total, 100, null, ...(hasCost ? [null, null] : [])],
    },
  ]);
};

export default function AbcTable({ rows, range }: { rows: AbcRow[]; range?: DateRange }) {
  const [filter, setFilter] = useState<AbcClass | null>(null);
  const { items, total } = useMemo(() => buildItems(rows), [rows]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>;
  }

  const summary = (["A", "B", "C"] as AbcClass[]).map((abc) => {
    const group = items.filter((i) => i.abc === abc);
    const revenue = group.reduce((sum, i) => sum + i.revenue, 0);
    return { abc, count: group.length, revenue, share: total > 0 ? (revenue / total) * 100 : 0 };
  });
  const visible = filter ? items.filter((i) => i.abc === filter) : items;
  const hasCost = items.some((i) => i.cost !== null);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-3">
        {summary.map((s) => (
          <button
            key={s.abc}
            type="button"
            onClick={() => setFilter(filter === s.abc ? null : s.abc)}
            aria-pressed={filter === s.abc}
            className={`rounded-lg border p-2 md:p-3 text-left transition-shadow hover:shadow ${
              filter === s.abc ? "ring-2 ring-primary" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${CLASS_STYLE[s.abc]}`}>{s.abc}</span>
              <span className="hidden sm:inline text-xs text-muted-foreground">{CLASS_HINT[s.abc]}</span>
            </div>
            <div className="mt-1 text-base md:text-lg font-bold text-foreground tabular-nums">{s.count} <span className="text-sm md:text-lg">ապրանք</span></div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatAmount(s.revenue)} · {percent(s.share)}
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {filter ? `Դաս ${filter}՝ ${visible.length} ապրանք` : `Բոլոր ապրանքները՝ ${items.length}`}
        </span>
        <div className="flex items-center gap-3">
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ցույց տալ բոլորը
            </button>
          )}
          <ExcelButton onExport={() => exportAbc(items, total, range)} />
        </div>
      </div>

      <div className="md:hidden">
        <MobileRows
          rows={visible.map((item) => {
            const profit = item.cost === null ? null : item.revenue - item.cost;
            return {
              key: item.name,
              title: <><span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${CLASS_STYLE[item.abc]}`}>{item.abc}</span>{items.indexOf(item) + 1}. {item.name}</>,
              value: formatAmount(item.revenue),
              metrics: [
                { label: "Մաս", value: percent(item.share) },
                { label: "Քանակ", value: formatAmount(item.qty) },
                ...(profit !== null && item.revenue > 0 ? [{ label: "Մարժա", value: percent((profit / item.revenue) * 100), strong: profit < 0 }] : []),
              ],
            };
          })}
        />
      </div>
      <div className="hidden md:block overflow-x-auto -mx-6 px-6">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className={`${thClass} text-right`}>#</th>
              <th className={`${thClass} text-left`}>Ապրանք</th>
              <th className={`${thClass} text-center`}>Դաս</th>
              <th className={`${thClass} text-right`}>Քանակ</th>
              <th className={`${thClass} text-right`}>Եկամուտ</th>
              <th className={`${thClass} text-right`}>Մաս</th>
              <th className={`${thClass} text-right`}>Կուտակային</th>
              {hasCost && <th className={`${thClass} text-right`}>Շահույթ</th>}
              {hasCost && <th className={`${thClass} text-right`}>Մարժա</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const rank = items.indexOf(item) + 1;
              const profit = item.cost === null ? null : item.revenue - item.cost;
              const margin = profit === null || item.revenue === 0 ? null : (profit / item.revenue) * 100;
              return (
                <tr key={item.name}>
                  <td className={`${tdClass} text-muted-foreground`}>{rank}</td>
                  <td className={`${tdClass} text-left whitespace-normal min-w-[12rem] text-foreground`}>
                    {item.name}
                  </td>
                  <td className={`${tdClass} text-center`}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${CLASS_STYLE[item.abc]}`}>
                      {item.abc}
                    </span>
                  </td>
                  <td className={tdClass}>{formatAmount(item.qty)}</td>
                  <td className={`${tdClass} font-semibold`}>{formatAmount(item.revenue)}</td>
                  <td className={tdClass}>{percent(item.share)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{percent(item.cumulative)}</td>
                  {hasCost && (
                    <td className={`${tdClass} ${profit !== null && profit < 0 ? "text-red-600" : ""}`}>
                      {profit === null ? "—" : formatAmount(profit)}
                    </td>
                  )}
                  {hasCost && (
                    <td className={`${tdClass} ${margin !== null && margin < 0 ? "text-red-600" : ""}`}>
                      {margin === null ? "—" : percent(margin)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
