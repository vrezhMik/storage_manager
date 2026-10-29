"use client";

import { Fragment, useState } from "react";
import { DateRange, formatDisplayDate } from "../components/DateRangeModal";
import { formatAmount, stickyClass, tdClass, thClass, toNumber } from "../sales/salesData";
import ExcelButton from "../../components/ExcelButton";
import MobileRows from "../components/MobileRows";
import { downloadXlsx } from "../../lib/excel";

// 1C returns { Datestart, Date, Debts: [{ Менеджер, Партнер, ОбъектРасчетов, Валюта,
// НачальныйОстаток, Увеличение, Уменьшение, КонечныйОстаток }] }.
export type DebtRow = {
  Менеджер?: string;
  Партнер?: string;
  ОбъектРасчетов?: string;
  Валюта?: string;
  НачальныйОстаток?: number | string;
  Увеличение?: number | string;
  Уменьшение?: number | string;
  КонечныйОстаток?: number | string;
};

const isDebtRow = (entry: unknown): entry is DebtRow =>
  Boolean(entry) &&
  typeof entry === "object" &&
  ("Партнер" in (entry as object) || "Менеджер" in (entry as object));

export const extractDebtRows = (data: unknown): DebtRow[] | null => {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as Record<string, unknown>).Debts ??
        Object.values(data as Record<string, unknown>).find(Array.isArray)
      : undefined;
  if (!Array.isArray(list)) return null;
  if (list.length === 0) return [];
  return list.some(isDebtRow) ? list.filter(isDebtRow) : null;
};

type Balance = { start: number; increase: number; decrease: number; end: number };

const emptyBalance = (): Balance => ({ start: 0, increase: 0, decrease: 0, end: 0 });

const addRow = (target: Balance, row: DebtRow) => {
  target.start += toNumber(row.НачальныйОстаток);
  target.increase += toNumber(row.Увеличение);
  target.decrease += toNumber(row.Уменьшение);
  target.end += toNumber(row.КонечныйОстаток);
};

type ManagerGroup = Balance & { name: string; partners: (Balance & { name: string })[] };

const text = (value: unknown) => String(value ?? "").trim() || "—";

const buildGroups = (rows: DebtRow[]) => {
  const managers = new Map<string, Balance & { partners: Map<string, Balance> }>();
  const totals = emptyBalance();

  rows.forEach((row) => {
    const manager = text(row.Менеджер);
    const partner = text(row.Партнер);
    let group = managers.get(manager);
    if (!group) {
      group = { ...emptyBalance(), partners: new Map() };
      managers.set(manager, group);
    }
    let partnerBalance = group.partners.get(partner);
    if (!partnerBalance) {
      partnerBalance = emptyBalance();
      group.partners.set(partner, partnerBalance);
    }
    addRow(group, row);
    addRow(partnerBalance, row);
    addRow(totals, row);
  });

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const groups: ManagerGroup[] = Array.from(managers, ([name, group]) => ({
    name,
    start: group.start,
    increase: group.increase,
    decrease: group.decrease,
    end: group.end,
    partners: Array.from(group.partners, ([partnerName, balance]) => ({
      name: partnerName,
      ...balance,
    })).sort(byName),
  })).sort(byName);

  return { groups, totals };
};

// Phone cards: the four balance columns as a short list.
const balanceDetails = (b: Balance, range: DateRange) => [
  { label: `Սկզբնական մնացորդ (${formatDisplayDate(range.start)})`, value: formatAmount(b.start) },
  { label: "Ավելացում", value: formatAmount(b.increase) },
  { label: "Նվազում", value: formatAmount(b.decrease) },
  { label: `Վերջնական մնացորդ (${formatDisplayDate(range.end)})`, value: formatAmount(b.end), strong: true },
];

function BalanceCells({ balance, bold }: { balance: Balance; bold?: boolean }) {
  const cls = `${tdClass} ${bold ? "font-semibold" : ""}`;
  return (
    <>
      <td className={cls}>{formatAmount(balance.start)}</td>
      <td className={cls}>{formatAmount(balance.increase)}</td>
      <td className={cls}>{formatAmount(balance.decrease)}</td>
      <td className={`${tdClass} font-semibold`}>{formatAmount(balance.end)}</td>
    </>
  );
}

function CurrencyTable({ rows, range, currency }: { rows: DebtRow[]; range: DateRange; currency: string | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { groups, totals } = buildGroups(rows);
  const allExpanded = groups.every((g) => expanded.has(g.name));

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          Պարտքեր{currency ? `, ${currency}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.name)))}
          className="hidden md:inline text-xs font-medium text-primary hover:underline"
        >
          {allExpanded ? "Փակել բոլորը" : "Բացել բոլորը"}
        </button>
      </div>
      <div className="md:hidden">
        <MobileRows
          rows={groups.map((g) => ({
            key: g.name,
            title: g.name,
            value: formatAmount(g.end),
            details: balanceDetails(g, range),
            children: g.partners.map((p) => ({ key: `${g.name}::${p.name}`, title: p.name, value: formatAmount(p.end), details: balanceDetails(p, range) })),
          }))}
          total={{ key: "total", title: "Ընդամենը", value: formatAmount(totals.end), details: balanceDetails(totals, range) }}
        />
      </div>
      <div className="hidden md:block overflow-x-auto -mx-6 px-6">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className={`${thClass} ${stickyClass}`}>Մենեջեր / Գործընկեր</th>
              <th className={`${thClass} text-right whitespace-normal`}>
                Սկզբնական մնացորդ
                <div className="font-normal">{formatDisplayDate(range.start)}</div>
              </th>
              <th className={`${thClass} text-right`}>Ավելացում</th>
              <th className={`${thClass} text-right`}>Նվազում</th>
              <th className={`${thClass} text-right whitespace-normal`}>
                Վերջնական մնացորդ
                <div className="font-normal">{formatDisplayDate(range.end)}</div>
              </th>
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
                      className={`${thClass} ${stickyClass} bg-muted text-foreground font-semibold max-w-[14rem] whitespace-normal`}
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
                      </button>
                    </th>
                    <BalanceCells balance={group} bold />
                  </tr>
                  {isOpen &&
                    group.partners.map((partner) => (
                      <tr key={`${group.name}::${partner.name}`}>
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

// One table per currency, so amounts in different currencies are never added up.
export default function DebtsTable({ rows, range }: { rows: DebtRow[]; range: DateRange }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>;
  }

  const byCurrency = new Map<string, DebtRow[]>();
  rows.forEach((row) => {
    const currency = String(row.Валюта ?? "").trim();
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), row]);
  });
  const currencies = Array.from(byCurrency.keys()).sort();

  // One sheet per currency, managers with their partners underneath.
  const exportExcel = () => {
    const period = `${formatDisplayDate(range.start)} – ${formatDisplayDate(range.end)}`;
    const cells = (b: Balance) => [b.start, b.increase, b.decrease, b.end];
    return downloadXlsx(`Պարտքեր ${period}`, currencies.map((currency) => {
      const { groups, totals } = buildGroups(byCurrency.get(currency)!);
      return {
        name: currency || "Պարտքեր",
        title: [`Պարտքեր${currency ? `, ${currency}` : ""}`, period],
        columns: [
          { header: "Մենեջեր / Գործընկեր", width: 42 },
          { header: `Սկզբնական մնացորդ ${formatDisplayDate(range.start)}`, numeric: true, width: 20 },
          { header: "Ավելացում", numeric: true },
          { header: "Նվազում", numeric: true },
          { header: `Վերջնական մնացորդ ${formatDisplayDate(range.end)}`, numeric: true, width: 20 },
        ],
        rows: groups.flatMap((g) => [
          { cells: [g.name, ...cells(g)], level: 0 as const },
          ...g.partners.map((p) => ({ cells: [p.name, ...cells(p)], level: 1 as const })),
        ]),
        total: ["Ընդամենը", ...cells(totals)],
      };
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExcelButton onExport={exportExcel} />
      </div>
      {currencies.map((currency) => (
        <CurrencyTable
          key={currency || "-"}
          rows={byCurrency.get(currency)!}
          range={range}
          currency={currency || null}
        />
      ))}
    </div>
  );
}
