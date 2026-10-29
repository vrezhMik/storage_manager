"use client";

import { ReactNode, useState } from "react";

// Phone layout for report tables: stacked cards that only scroll vertically.
// A row shows its title and main value; tapping it opens its details
// (e.g. amounts per date) and, for groups, the rows inside it.

export type MobileMetric = { label: string; value: ReactNode; strong?: boolean };

export type MobileRow = {
  key: string;
  title: ReactNode;
  // Big number on the right.
  value?: ReactNode;
  // Small label / value pairs under the title.
  metrics?: MobileMetric[];
  // Shown when the row is opened (vertical list, e.g. per date).
  details?: MobileMetric[];
  children?: MobileRow[];
};

function Row({ row, depth }: { row: MobileRow; depth: number }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(row.children?.length || row.details?.length);

  return (
    <div className={depth === 0 ? "rounded-lg border border-border bg-card" : "border-t border-border"}>
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left ${depth > 0 ? "pl-6" : ""} ${
          depth === 0 ? "font-semibold" : ""
        }`}
      >
        <span className={`mt-0.5 w-3 shrink-0 text-xs text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}>
          {expandable ? "▸" : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm text-foreground">{row.title}</span>
          {row.metrics && row.metrics.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-normal text-muted-foreground">
              {row.metrics.map((m) => (
                <span key={m.label}>
                  {m.label}՝ <span className={`tabular-nums ${m.strong ? "font-semibold text-foreground" : ""}`}>{m.value}</span>
                </span>
              ))}
            </span>
          )}
        </span>
        {row.value !== undefined && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{row.value}</span>
        )}
      </button>

      {open && row.details && row.details.length > 0 && (
        <dl className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-xs ${depth > 0 ? "pl-11" : "pl-8"}`}>
          {row.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className={`text-right tabular-nums ${d.strong ? "font-semibold" : ""}`}>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {open && row.children?.map((child) => <Row key={child.key} row={child} depth={depth + 1} />)}
    </div>
  );
}

export default function MobileRows({ rows, total }: { rows: MobileRow[]; total?: MobileRow }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Row key={row.key} row={row} depth={0} />
      ))}
      {total && (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5">
          <Row row={total} depth={0} />
        </div>
      )}
    </div>
  );
}
