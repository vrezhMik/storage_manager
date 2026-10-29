import { API_BASE, authFetch } from "../../lib/auth";
import type { DateRange } from "../components/DateRangeModal";
import { DebtRow, extractDebtRows } from "../debts/DebtsTable";
import type { OverdueData } from "../overdue-debts/OverdueDebtsClient";
import { extractSaleRows, rowManager, rowPartner, SaleRow, toNumber } from "../sales/salesData";

// One customer (1C partner) built from three existing reports: daily sales,
// debts and overdue debts. Used by the customers list, the customer card
// and the assistant.

export type Money = Record<string, number>; // currency ("" when not sent) -> amount

export type Customer = {
  name: string;
  manager: string;
  total: number;
  // Distinct days with a sale.
  purchaseDays: number;
  firstDate: string | null;
  lastDate: string | null;
  // Days since the last sale; null when there was none in the period.
  daysSince: number | null;
  // Average days between purchases; null with fewer than 2 purchase days.
  avgInterval: number | null;
  debt: Money;
  overdue: Money;
  overdueDays: number;
};

export type CustomerSource = {
  range: DateRange;
  sales: SaleRow[];
  // null when that report failed or is not set up for the user.
  debts: DebtRow[] | null;
  overdue: OverdueData["Debts"] | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayIso = () => isoDate(new Date());

export const daysAgoIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
};

export const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

// 1C sends "2026-10-01", "2026-10-01T00:00:00" or "01.10.2026".
export const saleDate = (row: SaleRow): string | null => {
  const raw = String(row.Период ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : null;
};

const addMoney = (money: Money, currency: unknown, amount: number) => {
  const key = String(currency ?? "").trim();
  money[key] = (money[key] ?? 0) + amount;
};

export const PERIODS = [
  { days: 90, label: "3 ամիս" },
  { days: 180, label: "6 ամիս" },
  { days: 365, label: "12 ամիս" },
];

// Going from the list to a card (and back) should not ask 1C again.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<number, { at: number; promise: Promise<CustomerSource> }>();

// Sales are required; debts and overdue debts are added when they load.
export const loadCustomerSource = (days: number): Promise<CustomerSource> => {
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;

  const range = { start: daysAgoIso(days - 1), end: todayIso() };
  const today = range.end;
  const promise = Promise.allSettled([
    authFetch<unknown>(`${API_BASE}/sales?start=${range.start}&end=${range.end}`),
    authFetch<unknown>(`${API_BASE}/debts?start=${today}&end=${today}`),
    authFetch<OverdueData>(`${API_BASE}/overdue-debts?date=${today}`),
  ]).then(([sales, debts, overdue]) => {
    if (sales.status === "rejected") throw sales.reason;
    const saleRows = extractSaleRows(sales.value);
    if (saleRows === null) throw new Error("Unexpected sales response");
    return {
      range,
      sales: saleRows,
      debts: debts.status === "fulfilled" ? extractDebtRows(debts.value) : null,
      overdue: overdue.status === "fulfilled" ? overdue.value?.Debts ?? [] : null,
    };
  });
  promise.catch(() => cache.delete(days));
  cache.set(days, { at: Date.now(), promise });
  return promise;
};

export const buildCustomers = (source: CustomerSource): Customer[] => {
  const today = dayNumber(source.range.end);
  type Acc = { manager: string; total: number; dates: Set<string>; debt: Money; overdue: Money; overdueDays: number };
  const byName = new Map<string, Acc>();
  const get = (name: string) => {
    let acc = byName.get(name);
    if (!acc) {
      acc = { manager: "", total: 0, dates: new Set(), debt: {}, overdue: {}, overdueDays: 0 };
      byName.set(name, acc);
    }
    return acc;
  };

  source.sales.forEach((row) => {
    const acc = get(rowPartner(row));
    const amount = toNumber(row.СуммаВыручки);
    acc.total += amount;
    if (!acc.manager && row.Менеджер) acc.manager = rowManager(row);
    const date = saleDate(row);
    if (date && amount > 0) acc.dates.add(date);
  });

  source.debts?.forEach((row) => {
    const amount = toNumber(row.КонечныйОстаток);
    if (amount === 0) return;
    const acc = get(rowPartner(row));
    addMoney(acc.debt, row.Валюта, amount);
    if (!acc.manager && row.Менеджер) acc.manager = String(row.Менеджер).trim();
  });

  source.overdue?.forEach((row) => {
    const amount = toNumber(row.Долг);
    const due = String(row.ДатаПогашения ?? "").slice(0, 10);
    if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return;
    const late = today - dayNumber(due);
    if (late <= 0) return;
    const acc = get(String(row.Партнер ?? "").trim() || "—");
    addMoney(acc.overdue, row.Валюта, amount);
    acc.overdueDays = Math.max(acc.overdueDays, late);
  });

  return Array.from(byName, ([name, acc]) => {
    const dates = Array.from(acc.dates).sort();
    const first = dates[0] ?? null;
    const last = dates[dates.length - 1] ?? null;
    return {
      name,
      manager: acc.manager || "—",
      total: acc.total,
      purchaseDays: dates.length,
      firstDate: first,
      lastDate: last,
      daysSince: last ? today - dayNumber(last) : null,
      avgInterval:
        first && last && dates.length > 1 ? Math.round((dayNumber(last) - dayNumber(first)) / (dates.length - 1)) : null,
      debt: acc.debt,
      overdue: acc.overdue,
      overdueDays: acc.overdueDays,
    };
  }).sort((a, b) => b.total - a.total);
};

// True when the customer stopped buying: no sale for `days` days (or none in
// the whole period while they did buy before / still owe).
export const isInactive = (c: Customer, days: number) => (c.daysSince === null ? true : c.daysSince >= days);

// "Usually buys every N days, now it has been much longer."
export const isLate = (c: Customer) =>
  c.avgInterval !== null && c.daysSince !== null && c.purchaseDays >= 3 && c.daysSince > Math.max(14, c.avgInterval * 2);

export const hasMoney = (m: Money) => Object.values(m).some((v) => v !== 0);

export const moneyText = (m: Money, format: (n: number) => string) => {
  const entries = Object.entries(m).filter(([, v]) => v !== 0);
  if (entries.length === 0) return "—";
  return entries.map(([currency, v]) => `${format(v)}${currency ? ` ${currency}` : ""}`).join(" · ");
};

export const customerHref = (name: string, days: number) =>
  `/reports/customers/card/?name=${encodeURIComponent(name)}&days=${days}`;
