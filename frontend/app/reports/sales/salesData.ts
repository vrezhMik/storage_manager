// 1C returns rows like
// { Период: "2026-10-01", Склад: "...", Партнер: "...", СуммаВыручки: 1500 }.
export type SaleRow = {
  Период?: string;
  Склад?: string;
  Warehouse?: string;
  Менеджер?: string;
  Партнер?: string;
  СуммаВыручки?: number | string;
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

export const toNumber = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const formatAmount = (value: number) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export const rowPartner = (row: SaleRow) => String(row.Партнер ?? "").trim() || "—";
export const rowDate = (row: SaleRow) => String(row.Период ?? "").trim() || "—";
export const rowWarehouse = (row: SaleRow) => String(row.Склад ?? row.Warehouse ?? "").trim() || "—";
export const NO_MANAGER = "Առանց մենեջերի";
export const NO_VALUE = "—";
export const rowManager = (row: SaleRow) => String(row.Менеджер ?? "").trim() || NO_MANAGER;

export const thClass = "border border-border px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap";
export const tdClass = "border border-border px-3 py-2 text-sm text-right whitespace-nowrap tabular-nums";
export const stickyClass = "sticky left-0 z-10 bg-card text-left";
