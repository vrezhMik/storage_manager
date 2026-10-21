import { formatDisplayDate } from "../components/DateRangeModal";

// 1C returns rows like { Период: "2026-10-01", Партнер: "...", СуммаВыручки: 1500 }.
type SaleRow = {
  Период?: string;
  Партнер?: string;
  СуммаВыручки?: number | string;
};

type Pivot = {
  partners: string[];
  dates: string[];
  cells: Map<string, Map<string, number>>;
  partnerTotals: Map<string, number>;
  dateTotals: Map<string, number>;
  total: number;
};

const isSaleRow = (entry: unknown): entry is SaleRow =>
  Boolean(entry) && typeof entry === "object" && "Партнер" in (entry as object);

// Accept a bare array or an object that wraps the array in one of its fields.
export const extractSaleRows = (data: unknown): SaleRow[] | null => {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? Object.values(data as Record<string, unknown>).find(Array.isArray)
      : undefined;
  if (!Array.isArray(list)) return null;
  if (list.length === 0) return [];
  return list.some(isSaleRow) ? list.filter(isSaleRow) : null;
};

const toNumber = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const buildPivot = (rows: SaleRow[]): Pivot => {
  const cells = new Map<string, Map<string, number>>();
  const partnerTotals = new Map<string, number>();
  const dateTotals = new Map<string, number>();
  let total = 0;

  rows.forEach((row) => {
    const partner = String(row.Партнер ?? "").trim() || "—";
    const date = String(row.Период ?? "").trim() || "—";
    const amount = toNumber(row.СуммаВыручки);

    const byDate = cells.get(partner) ?? new Map<string, number>();
    byDate.set(date, (byDate.get(date) ?? 0) + amount);
    cells.set(partner, byDate);
    partnerTotals.set(partner, (partnerTotals.get(partner) ?? 0) + amount);
    dateTotals.set(date, (dateTotals.get(date) ?? 0) + amount);
    total += amount;
  });

  return {
    partners: Array.from(cells.keys()).sort((a, b) => a.localeCompare(b)),
    dates: Array.from(dateTotals.keys()).sort(),
    cells,
    partnerTotals,
    dateTotals,
    total,
  };
};

const formatAmount = (value: number) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

const thClass = "border border-border px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap";
const tdClass = "border border-border px-3 py-2 text-sm text-right whitespace-nowrap tabular-nums";
const stickyClass = "sticky left-0 z-10 bg-card text-left";

export default function SalesTable({ rows }: { rows: SaleRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>;
  }

  const pivot = buildPivot(rows);

  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="min-w-full border-collapse">
        <caption className="caption-top pb-2 text-left text-sm text-muted-foreground">
          Վաճառք
        </caption>
        <thead>
          <tr>
            <th rowSpan={2} className={`${thClass} ${stickyClass}`}>
              Գործընկեր
            </th>
            <th colSpan={pivot.dates.length} className={`${thClass} text-center`}>
              Ամսաթիվ
            </th>
            <th rowSpan={2} className={`${thClass} text-right`}>
              Ընդամենը
            </th>
          </tr>
          <tr>
            {pivot.dates.map((date) => (
              <th key={date} className={`${thClass} text-right`}>
                {formatDisplayDate(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pivot.partners.map((partner) => (
            <tr key={partner}>
              <th scope="row" className={`${thClass} ${stickyClass} text-foreground font-medium max-w-[12rem] whitespace-normal`}>
                {partner}
              </th>
              {pivot.dates.map((date) => {
                const value = pivot.cells.get(partner)?.get(date);
                return (
                  <td key={date} className={tdClass}>
                    {value === undefined ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatAmount(value)
                    )}
                  </td>
                );
              })}
              <td className={`${tdClass} font-semibold`}>
                {formatAmount(pivot.partnerTotals.get(partner) ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/50">
            <th scope="row" className={`${thClass} ${stickyClass} bg-muted text-foreground`}>
              Ընդամենը
            </th>
            {pivot.dates.map((date) => (
              <td key={date} className={`${tdClass} font-semibold`}>
                {formatAmount(pivot.dateTotals.get(date) ?? 0)}
              </td>
            ))}
            <td className={`${tdClass} font-bold`}>{formatAmount(pivot.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
