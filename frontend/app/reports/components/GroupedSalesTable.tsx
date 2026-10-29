"use client";

import { Fragment, useState } from "react";
import { formatDisplayDate } from "./DateRangeModal";
import ExcelButton from "../../components/ExcelButton";
import MobileRows from "./MobileRows";
import { downloadXlsx } from "../../lib/excel";
import {
  SaleRow,
  formatAmount,
  rowDate,
  rowPartner,
  stickyClass,
  tdClass,
  thClass,
  toNumber,
  NO_MANAGER,
  NO_VALUE,
} from "../sales/salesData";

type Amounts = { byDate: Map<string, number>; total: number };

type Group = Amounts & {
  name: string;
  partners: (Amounts & { name: string })[];
};

const addAmount = (target: Amounts, date: string, amount: number) => {
  target.byDate.set(date, (target.byDate.get(date) ?? 0) + amount);
  target.total += amount;
};

const emptyAmounts = (): Amounts => ({ byDate: new Map(), total: 0 });

const buildGroups = (rows: SaleRow[], groupOf: (row: SaleRow) => string) => {
  const groupsByName = new Map<string, Amounts & { partners: Map<string, Amounts> }>();
  const totals = emptyAmounts();
  const dates = new Set<string>();

  rows.forEach((row) => {
    const groupName = groupOf(row);
    const partner = rowPartner(row);
    const date = rowDate(row);
    const amount = toNumber(row.СуммаВыручки);
    dates.add(date);

    let group = groupsByName.get(groupName);
    if (!group) {
      group = { ...emptyAmounts(), partners: new Map() };
      groupsByName.set(groupName, group);
    }
    let partnerAmounts = group.partners.get(partner);
    if (!partnerAmounts) {
      partnerAmounts = emptyAmounts();
      group.partners.set(partner, partnerAmounts);
    }
    addAmount(group, date, amount);
    addAmount(partnerAmounts, date, amount);
    addAmount(totals, date, amount);
  });

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  // Rows without a group name go last.
  const isEmptyGroup = (name: string) => name === NO_MANAGER || name === NO_VALUE;
  const groupOrder = (a: { name: string }, b: { name: string }) =>
    Number(isEmptyGroup(a.name)) - Number(isEmptyGroup(b.name)) || byName(a, b);
  const groups: Group[] = Array.from(groupsByName, ([name, group]) => ({
    name,
    byDate: group.byDate,
    total: group.total,
    partners: Array.from(group.partners, ([partnerName, amounts]) => ({
      name: partnerName,
      ...amounts,
    })).sort(byName),
  })).sort(groupOrder);

  return { groups, totals, dates: Array.from(dates).sort() };
};

function AmountCells({ amounts, dates, bold }: { amounts: Amounts; dates: string[]; bold?: boolean }) {
  return (
    <>
      {dates.map((date) => {
        const value = amounts.byDate.get(date);
        return (
          <td key={date} className={`${tdClass} ${bold ? "font-semibold" : ""}`}>
            {value === undefined ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatAmount(value)
            )}
          </td>
        );
      })}
      <td className={`${tdClass} font-semibold`}>{formatAmount(amounts.total)}</td>
    </>
  );
}

type Props = {
  rows: SaleRow[];
  // Name of the group (manager, warehouse, ...) each row belongs to.
  groupOf: (row: SaleRow) => string;
  // First column header, e.g. "Պահեստ / Գործընկեր".
  groupHeader: string;
  // Report name, used for the Excel file.
  title?: string;
};

// Sales pivot: group rows with + / − to show their partners, dates as columns.
export default function GroupedSalesTable({ rows, groupOf, groupHeader, title = "Վաճառք" }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>;
  }

  const { groups, totals, dates } = buildGroups(rows, groupOf);
  const allExpanded = groups.every((g) => expanded.has(g.name));

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Phone cards: amounts per date, only dates with sales.
  const perDate = (a: Amounts) =>
    dates
      .filter((d) => a.byDate.has(d))
      .map((d) => ({ label: formatDisplayDate(d), value: formatAmount(a.byDate.get(d) ?? 0) }));

  // Excel gets every group with its partners already "opened".
  const exportExcel = () => {
    const amounts = (a: Amounts) => [...dates.map((d) => a.byDate.get(d) ?? null), a.total];
    const period = dates.length ? `${formatDisplayDate(dates[0])} – ${formatDisplayDate(dates[dates.length - 1])}` : "";
    return downloadXlsx(`${title} ${period}`, [
      {
        name: title,
        title: [title, period],
        columns: [
          { header: groupHeader, width: 42 },
          ...dates.map((d) => ({ header: formatDisplayDate(d), width: 14, numeric: true })),
          { header: "Ընդամենը", width: 16, numeric: true },
        ],
        rows: groups.flatMap((g) => [
          { cells: [g.name, ...amounts(g)], level: 0 as const },
          ...g.partners.map((p) => ({ cells: [p.name, ...amounts(p)], level: 1 as const })),
        ]),
        total: ["Ընդամենը", ...amounts(totals)],
      },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Վաճառք</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.name)))}
            className="hidden md:inline text-xs font-medium text-primary hover:underline"
          >
            {allExpanded ? "Փակել բոլորը" : "Բացել բոլորը"}
          </button>
          <ExcelButton onExport={exportExcel} />
        </div>
      </div>
      <div className="md:hidden">
        <MobileRows
          rows={groups.map((g) => ({
            key: g.name,
            title: g.name,
            value: formatAmount(g.total),
            details: perDate(g),
            children: g.partners.map((p) => ({ key: `${g.name}::${p.name}`, title: p.name, value: formatAmount(p.total), details: perDate(p) })),
          }))}
          total={{ key: "total", title: "Ընդամենը", value: formatAmount(totals.total), details: perDate(totals) }}
        />
      </div>
      <div className="hidden md:block overflow-x-auto -mx-6 px-6">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th rowSpan={2} className={`${thClass} ${stickyClass}`}>
                {groupHeader}
              </th>
              <th colSpan={dates.length} className={`${thClass} text-center`}>
                Ամսաթիվ
              </th>
              <th rowSpan={2} className={`${thClass} text-right`}>
                Ընդամենը
              </th>
            </tr>
            <tr>
              {dates.map((date) => (
                <th key={date} className={`${thClass} text-right`}>
                  {formatDisplayDate(date)}
                </th>
              ))}
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
                    <AmountCells amounts={group} dates={dates} bold />
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
                        <AmountCells amounts={partner} dates={dates} />
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
              <AmountCells amounts={totals} dates={dates} bold />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
