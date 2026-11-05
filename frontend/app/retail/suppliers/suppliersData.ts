import { API_BASE, authFetch } from "../../lib/auth";
import { toNumber } from "../../reports/sales/salesData";

// 1C (/retail-suppliers) returns posted goods receipts of the user's store for
// the last Days days: { Date, Days, Deliveries: [{ Поставщик, Дата, Сумма, Документ }],
// Items: [{ Поставщик, Номенклатура, Количество, Сумма }], ErrorMessage }.
export type SuppliersData = {
  Date?: string;
  Days?: number | string;
  Deliveries?: { Поставщик?: string; Дата?: string; Сумма?: number | string; Документ?: string }[];
  Items?: { Поставщик?: string; Номенклатура?: string; Количество?: number | string; Сумма?: number | string }[];
  ErrorMessage?: string;
};

export type Delivery = { date: string; sum: number; docs: string[] };
export type SupplierItem = { name: string; qty: number; sum: number };

export type Supplier = {
  name: string;
  // One entry per delivery day (several documents on one day = one delivery).
  deliveries: Delivery[];
  total: number;
  lastDate: string;
  // Average days between deliveries; null with fewer than 2 delivery days.
  avgInterval: number | null;
  perMonth: number;
  // lastDate + avgInterval.
  expectedDate: string | null;
  // Days after the expected date (positive = late).
  lateDays: number | null;
  thisMonth: Delivery[];
  items: SupplierItem[];
};

export const DEFAULT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
const fromDayNumber = (n: number) => {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// The list and a supplier's card use the same answer: ask 1C once per date.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<SuppliersData> }>();

export const loadSuppliers = (date: string): Promise<SuppliersData> => {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = authFetch<SuppliersData>(`${API_BASE}/retail-suppliers?date=${date}&days=${DEFAULT_DAYS}`).then((r) => r ?? {});
  promise.catch(() => cache.delete(date));
  cache.set(date, { at: Date.now(), promise });
  return promise;
};

export const buildSuppliers = (data: SuppliersData, date: string): Supplier[] => {
  const days = toNumber(data.Days) || DEFAULT_DAYS;
  const today = dayNumber(date);
  const month = date.slice(0, 7);

  const byName = new Map<string, Map<string, Delivery>>();
  (data.Deliveries ?? []).forEach((row) => {
    const name = String(row.Поставщик ?? "").trim() || "—";
    const day = String(row.Дата ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const perDay = byName.get(name) ?? new Map<string, Delivery>();
    const delivery = perDay.get(day) ?? { date: day, sum: 0, docs: [] };
    delivery.sum += toNumber(row.Сумма);
    if (row.Документ) delivery.docs.push(String(row.Документ));
    perDay.set(day, delivery);
    byName.set(name, perDay);
  });

  const itemsByName = new Map<string, SupplierItem[]>();
  (data.Items ?? []).forEach((row) => {
    const name = String(row.Поставщик ?? "").trim() || "—";
    const list = itemsByName.get(name) ?? [];
    list.push({ name: String(row.Номенклатура ?? "").trim() || "—", qty: toNumber(row.Количество), sum: toNumber(row.Сумма) });
    itemsByName.set(name, list);
  });

  return Array.from(byName, ([name, perDay]) => {
    const deliveries = Array.from(perDay.values()).sort((a, b) => a.date.localeCompare(b.date));
    const first = deliveries[0].date;
    const lastDate = deliveries[deliveries.length - 1].date;
    const avgInterval =
      deliveries.length > 1 ? (dayNumber(lastDate) - dayNumber(first)) / (deliveries.length - 1) : null;
    const expected = avgInterval === null ? null : dayNumber(lastDate) + Math.round(avgInterval);
    return {
      name,
      deliveries,
      total: deliveries.reduce((s, d) => s + d.sum, 0),
      lastDate,
      avgInterval,
      perMonth: (deliveries.length / days) * 30,
      expectedDate: expected === null ? null : fromDayNumber(expected),
      lateDays: expected === null ? null : today - expected,
      thisMonth: deliveries.filter((d) => d.date.startsWith(month)),
      items: (itemsByName.get(name) ?? []).sort((a, b) => b.sum - a.sum),
    };
  });
};

export const isLate = (s: Supplier) => s.lateDays !== null && s.lateDays >= 1;

export const supplierHref = (name: string, date: string) =>
  `/retail/suppliers/card/?name=${encodeURIComponent(name)}&date=${date}`;

export const oneDecimal = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
