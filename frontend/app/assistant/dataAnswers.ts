import { API_BASE, authFetch } from "../lib/auth";
import { formatDisplayDate } from "../reports/components/DateRangeModal";
import {
  buildCustomers,
  Customer,
  customerHref,
  dayNumber,
  hasMoney,
  isInactive,
  isoDate,
  loadCustomerSource,
  moneyText,
} from "../reports/customers/customerData";
import { extractDebtRows } from "../reports/debts/DebtsTable";
import type { OverdueData } from "../reports/overdue-debts/OverdueDebtsClient";
import { abcHref, debtsHref, salesByWarehouseHref, salesHref } from "../reports/links";
import { extractSaleRows, formatAmount, rowManager, rowPartner, rowWarehouse, SaleRow, toNumber } from "../reports/sales/salesData";
import type { DataIntent } from "./dataQuestions";

// The answer to a data question: one sentence plus a short ranked list,
// built only from 1C numbers.
export type DataAnswerRow = { name: string; value: string; amount?: number; hint?: string; href?: string };
export type DataAnswer = {
  title: string;
  sentence: string;
  rows: DataAnswerRow[];
  link?: { href: string; label: string };
  note?: string;
  // false for facts about one thing (no 1., 2., ... and no bars).
  ranked?: boolean;
};

const CUSTOMER_DAYS = 180;

const periodText = (start: string, end: string) => {
  const now = new Date();
  const today = isoDate(now);
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const range = start === end ? formatDisplayDate(start) : `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
  if (start === today && end === today) return `այսօր (${range})`;
  if (start === monthStart && end === today) return `այս ամիս (${range})`;
  return range;
};

const defaultRange = (intent: DataIntent) => {
  const now = new Date();
  const end = intent.end ?? isoDate(now);
  return { start: intent.start ?? isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end };
};

// Sum per name, sorted by the requested order.
const rank = (entries: [string, number][], order: "desc" | "asc") => {
  const sums = new Map<string, number>();
  entries.forEach(([name, value]) => sums.set(name, (sums.get(name) ?? 0) + value));
  const list = Array.from(sums).filter(([, v]) => v !== 0);
  list.sort((a, b) => (order === "asc" ? a[1] - b[1] : b[1] - a[1]));
  return list;
};

const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : undefined;

// Debts can be in several currencies: rank inside the one with the most money.
const mainCurrency = (byCurrency: Map<string, number>) =>
  Array.from(byCurrency).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

const withCurrency = (v: number, currency: string) => `${formatAmount(v)}${currency ? ` ${currency}` : ""}`;

const findMentioned = <T extends { name: string }>(list: T[], question: string, partner?: string): T | null => {
  const q = (partner ?? question).toLowerCase();
  const exact = partner ? list.find((c) => c.name.toLowerCase() === q) : undefined;
  if (exact) return exact;
  // The longest customer name the question contains (names under 4 letters are too ambiguous).
  const hits = list.filter((c) => c.name.length >= 4 && q.includes(c.name.toLowerCase()));
  if (hits.length) return hits.sort((a, b) => b.name.length - a.name.length)[0];
  if (partner) {
    const part = list.filter((c) => c.name.toLowerCase().includes(q));
    if (part.length === 1) return part[0];
  }
  return null;
};

const customerAnswer = (c: Customer): DataAnswer => {
  const rows: DataAnswerRow[] = [
    { name: `Վաճառք (վերջին ${CUSTOMER_DAYS / 30} ամիս)`, value: formatAmount(c.total) },
    {
      name: "Վերջին գնում",
      value: c.lastDate ? formatDisplayDate(c.lastDate) : "—",
      hint: c.daysSince === null ? "գնում չկա" : `${c.daysSince} օր առաջ`,
    },
    { name: "Որքան հաճախ", value: c.avgInterval !== null ? `${c.avgInterval} օրը մեկ` : "—", hint: `${c.purchaseDays} գնման օր` },
    { name: "Պարտք", value: moneyText(c.debt, formatAmount) },
    {
      name: "Ժամկետանց",
      value: moneyText(c.overdue, formatAmount),
      hint: c.overdueDays > 0 ? `${c.overdueDays} օր ուշացում` : undefined,
    },
  ];
  const warning =
    c.daysSince === null
      ? " Վերջին 6 ամսում գնում չի կատարել։"
      : isInactive(c, 30)
        ? ` ${c.daysSince} օր է գնում չի կատարել։`
        : "";
  return {
    title: c.name,
    sentence: `${c.name}. մենեջեր՝ ${c.manager}.${warning}`,
    rows,
    ranked: false,
    link: { href: customerHref(c.name, CUSTOMER_DAYS), label: "Բացել հաճախորդի քարտը" },
  };
};

const fetchSales = async (path: string, start: string, end: string): Promise<SaleRow[]> => {
  const rows = extractSaleRows(await authFetch<unknown>(`${API_BASE}/${path}?start=${start}&end=${end}`));
  if (rows === null) throw new Error("Unexpected sales response");
  return rows;
};

export const answerDataQuestion = async (intent: DataIntent, question: string): Promise<DataAnswer | null> => {
  const order = intent.order ?? "desc";
  const most = order === "asc" ? "Ամենաքիչ" : "Ամենաշատ";
  const { start, end } = defaultRange(intent);
  const period = periodText(start, end);

  switch (intent.topic) {
    case "sales_total":
    case "sales_by_manager":
    case "sales_by_partner":
    case "sales_by_warehouse": {
      const byWarehouse = intent.topic === "sales_by_warehouse";
      const rows = await fetchSales(byWarehouse ? "sales-by-warehouse" : "sales", start, end);
      const total = rows.reduce((s, r) => s + toNumber(r.СуммаВыручки), 0);
      const key = byWarehouse ? rowWarehouse : intent.topic === "sales_by_partner" ? rowPartner : rowManager;
      const ranked = rank(rows.map((r) => [key(r), toNumber(r.СуммаВыручки)]), order);
      if (intent.topic === "sales_by_partner" || intent.partner) {
        // "How much did <customer> buy" is about that one customer.
        const named = findMentioned(Array.from(new Set(rows.map(rowPartner)), (name) => ({ name })), question, intent.partner);
        if (named) return answerDataQuestion({ topic: "customer", partner: named.name }, question);
      }
      const limit = intent.limit ?? 5;
      const what = byWarehouse ? "պահեստ" : intent.topic === "sales_by_partner" ? "հաճախորդ" : "մենեջեր";
      const link = byWarehouse
        ? { href: salesByWarehouseHref({ start, end }), label: "Բացել «Վաճառք ըստ պահեստների»" }
        : intent.topic === "sales_by_partner"
          ? { href: `/reports/customers/?days=${CUSTOMER_DAYS}`, label: "Բացել «Հաճախորդներ»" }
          : { href: salesHref({ start, end }), label: "Բացել «Վաճառք ըստ մենեջերների»" };
      if (ranked.length === 0) {
        return { title: "Վաճառք", sentence: `Վաճառք չկա՝ ${period}։`, rows: [], link };
      }
      const [topName, topValue] = ranked[0];
      const sentence =
        intent.topic === "sales_total"
          ? `Ընդհանուր վաճառքը ${period}՝ ${formatAmount(total)}։ Ստորև՝ ըստ մենեջերների։`
          : `${most} վաճառքը ${period}՝ ${topName}, ${formatAmount(topValue)}${share(topValue, total) ? ` (${share(topValue, total)})` : ""}։ Ընդհանուրը՝ ${formatAmount(total)}։`;
      return {
        title: intent.topic === "sales_total" ? "Վաճառք" : `Վաճառք ըստ ${what}ի`,
        sentence,
        rows: ranked.slice(0, limit).map(([name, value]) => ({
          name,
          value: formatAmount(value),
          amount: value,
          hint: share(value, total),
          href: intent.topic === "sales_by_partner" ? customerHref(name, CUSTOMER_DAYS) : undefined,
        })),
        link,
      };
    }

    case "top_items": {
      const data = await authFetch<{ Items?: { Номенклатура?: string; СуммаВыручки?: number | string; Количество?: number | string }[] }>(
        `${API_BASE}/abc?start=${start}&end=${end}`,
      );
      const items = data?.Items ?? [];
      const total = items.reduce((s, i) => s + toNumber(i.СуммаВыручки), 0);
      const ranked = rank(items.map((i) => [String(i.Номенклатура ?? "").trim() || "—", toNumber(i.СуммаВыручки)]), order);
      const link = { href: abcHref({ start, end }), label: "Բացել «Թոփ ապրանքներ (ABC)»" };
      if (ranked.length === 0) return { title: "Ապրանքներ", sentence: `Վաճառք չկա՝ ${period}։`, rows: [], link };
      return {
        title: order === "asc" ? "Ամենաքիչ վաճառված ապրանքները" : "Ամենաշատ վաճառված ապրանքները",
        sentence: `${most} վաճառված ապրանքը ${period}՝ ${ranked[0][0]}, ${formatAmount(ranked[0][1])}։`,
        rows: ranked.slice(0, intent.limit ?? 5).map(([name, value]) => ({
          name,
          value: formatAmount(value),
          amount: value,
          hint: share(value, total),
        })),
        link,
      };
    }

    case "debts": {
      const asOf = intent.end ?? isoDate(new Date());
      const rows = extractDebtRows(await authFetch<unknown>(`${API_BASE}/debts?start=${asOf}&end=${asOf}`)) ?? [];
      const customer = findMentioned(rows.map((r) => ({ name: rowPartner(r) })), question, intent.partner);
      if (customer) return answerDataQuestion({ topic: "customer", partner: customer.name }, question);
      const byCurrency = new Map<string, number>();
      rows.forEach((r) => {
        const c = String(r.Валюта ?? "").trim();
        byCurrency.set(c, (byCurrency.get(c) ?? 0) + toNumber(r.КонечныйОстаток));
      });
      const currency = mainCurrency(byCurrency);
      const ranked = rank(
        rows.filter((r) => String(r.Валюта ?? "").trim() === currency).map((r) => [rowPartner(r), toNumber(r.КонечныйОстаток)]),
        order,
      ).filter(([, v]) => v > 0);
      const total = byCurrency.get(currency) ?? 0;
      const others = Array.from(byCurrency).filter(([c, v]) => c !== currency && v !== 0);
      return {
        title: "Պարտքեր",
        sentence: `Ընդհանուր պարտքը ${formatDisplayDate(asOf)} դրությամբ՝ ${withCurrency(total, currency)}${
          ranked.length ? `։ ${most} պարտքը՝ ${ranked[0][0]}, ${withCurrency(ranked[0][1], currency)}` : ""
        }։`,
        rows: ranked.slice(0, intent.limit ?? 5).map(([name, value]) => ({
          name,
          value: withCurrency(value, currency),
          amount: value,
          hint: share(value, total),
          href: customerHref(name, CUSTOMER_DAYS),
        })),
        note: others.length ? `Այլ արժույթներով՝ ${others.map(([c, v]) => withCurrency(v, c)).join(", ")}` : undefined,
        link: { href: debtsHref({ start: asOf, end: asOf }), label: "Բացել «Պարտքեր»" },
      };
    }

    case "overdue": {
      const asOf = intent.end ?? isoDate(new Date());
      const data = await authFetch<OverdueData>(`${API_BASE}/overdue-debts?date=${asOf}`);
      const today = dayNumber(asOf);
      const late = (data?.Debts ?? [])
        .map((r) => ({
          name: String(r.Партнер ?? "").trim() || "—",
          currency: String(r.Валюта ?? "").trim(),
          amount: toNumber(r.Долг),
          days: /^\d{4}-\d{2}-\d{2}/.test(String(r.ДатаПогашения ?? "")) ? today - dayNumber(String(r.ДатаПогашения).slice(0, 10)) : 0,
        }))
        .filter((r) => r.amount > 0 && r.days > 0);
      const customer = findMentioned(late, question, intent.partner);
      if (customer) return answerDataQuestion({ topic: "customer", partner: customer.name }, question);
      const byCurrency = new Map<string, number>();
      late.forEach((r) => byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + r.amount));
      const currency = mainCurrency(byCurrency);
      const maxDays = new Map<string, number>();
      late.forEach((r) => maxDays.set(r.name, Math.max(maxDays.get(r.name) ?? 0, r.days)));
      const ranked = rank(late.filter((r) => r.currency === currency).map((r) => [r.name, r.amount]), order);
      const link = { href: "/reports/overdue-debts", label: "Բացել «Ժամկետանց պարտքեր»" };
      if (ranked.length === 0) {
        return { title: "Ժամկետանց պարտքեր", sentence: `Ժամկետանց պարտքեր չկան ${formatDisplayDate(asOf)} դրությամբ։`, rows: [], link };
      }
      const others = Array.from(byCurrency).filter(([c]) => c !== currency);
      return {
        title: "Ժամկետանց պարտքեր",
        sentence: `Ժամկետանց պարտքը ${formatDisplayDate(asOf)} դրությամբ՝ ${withCurrency(byCurrency.get(currency) ?? 0, currency)}, ${ranked.length} հաճախորդ։ ${most}ը՝ ${ranked[0][0]}, ${withCurrency(ranked[0][1], currency)}։`,
        rows: ranked.slice(0, intent.limit ?? 5).map(([name, value]) => ({
          name,
          value: withCurrency(value, currency),
          amount: value,
          hint: `${maxDays.get(name) ?? 0} օր ուշացում`,
          href: customerHref(name, CUSTOMER_DAYS),
        })),
        note: others.length ? `Այլ արժույթներով՝ ${others.map(([c, v]) => withCurrency(v, c)).join(", ")}` : undefined,
        link,
      };
    }

    case "inactive_customers": {
      const days = intent.days ?? 30;
      const customers = buildCustomers(await loadCustomerSource(CUSTOMER_DAYS));
      // Only customers who did buy in the last 6 months: the ones being lost.
      const lost = customers
        .filter((c) => c.lastDate !== null && isInactive(c, days))
        .sort((a, b) => (order === "asc" ? a.total - b.total : b.total - a.total));
      const link = { href: `/reports/customers/?days=${CUSTOMER_DAYS}&filter=inactive${days >= 90 ? 90 : days >= 60 ? 60 : 30}`, label: "Բացել «Հաճախորդներ»" };
      if (lost.length === 0) {
        return { title: "Չգնող հաճախորդներ", sentence: `Բոլոր հաճախորդները գնել են վերջին ${days} օրում։`, rows: [], link };
      }
      return {
        title: "Չգնող հաճախորդներ",
        sentence: `${lost.length} հաճախորդ ${days} և ավելի օր է գնում չի կատարել (նրանք գնել են վերջին 6 ամսում)։ Ամենամեծ վաճառքով հաճախորդները վերևում են։`,
        rows: lost.slice(0, intent.limit ?? 10).map((c) => ({
          name: c.name,
          value: `${c.daysSince} օր`,
          hint: `6 ամսում՝ ${formatAmount(c.total)}${hasMoney(c.debt) ? ` · պարտք՝ ${moneyText(c.debt, formatAmount)}` : ""}`,
          href: customerHref(c.name, CUSTOMER_DAYS),
        })),
        link,
      };
    }

    case "customer": {
      const customers = buildCustomers(await loadCustomerSource(CUSTOMER_DAYS));
      const c = findMentioned(customers, question, intent.partner);
      if (!c) {
        return {
          title: "Հաճախորդ",
          sentence: `«${intent.partner ?? question}» անունով հաճախորդ չգտնվեց։ Փորձեք գրել անունը այնպես, ինչպես 1C-ում է։`,
          rows: [],
          link: { href: `/reports/customers/?days=${CUSTOMER_DAYS}`, label: "Բացել «Հաճախորդներ»" },
        };
      }
      return customerAnswer(c);
    }

    default:
      return null;
  }
};
