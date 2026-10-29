const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A question about the company's numbers, turned into one report request.
// The same shape comes from the backend chat model (/assistant/intent) and
// from the built-in rules below.

export type DataTopic =
  | "sales_total"
  | "sales_by_manager"
  | "sales_by_partner"
  | "sales_by_warehouse"
  | "top_items"
  | "debts"
  | "overdue"
  | "inactive_customers"
  | "customer";

export type DataIntent = {
  topic: DataTopic | "none";
  start?: string;
  end?: string;
  order?: "desc" | "asc";
  limit?: number;
  days?: number;
  partner?: string;
};

const clean = (q: string) =>
  ` ${q.toLowerCase().replace(/[՞՛՜]/g, "").replace(/[?!.,;:«»"()]/g, " ").replace(/\s+/g, " ").trim()} `;

const has = (q: string, re: RegExp) => re.test(q);

// "How do I ..." questions belong to the knowledge base, not to the numbers.
const HOW_TO = /ինչպես|ինչպե|ոնց |որտեղ|ինչու|ինչ է նշանակ|ձևակերպ|կարգավոր|հաշվետվությունը| как | где |зачем|почему|настро|оформ|что такое| how | where | why /;

const ASKS_DATA = // " ըստ " = "by" (per manager, per customer)
  / ըստ | по | ով | ովքեր| ում | որ | որն | որոնք|որքան|ինչքան|քանի|ամենա|թոփ|top|топ|ցույց տուր|ցուցակ|լավագույն|վատագույն| кто | кого |сколько|какой|какие|какая|покажи|список|лучш|худш|больше всего|меньше всего| who | how much | which /;

const TOPICS: [DataTopic, RegExp][] = [
  ["inactive_customers", /չի գնել|չեն գնել|չի գնում|չեն գնում|գնում չի|գնում չեն|գնումներ չ|չեն առել|չի առել|չեն պատվիրել|պասիվ|կորցր|не покупа|не заказыва|перестал|stopped buying|not bought/],
  ["overdue", /ժամկետանց|ուշաց|просроч|overdue/],
  ["debts", /պարտ|долг|задолж|debt|owe/],
  ["top_items", /ապրանք|товар|номенклат|abc|item|product/],
  ["sales_by_warehouse", /պահեստ|склад|warehouse/],
  ["sales_by_manager", /մենեջեր|менеджер|վաճառող|продав|աշխատակից|manager/],
  ["sales_by_partner", /գնել|գնեց|купил|bought|հաճախորդ|գործընկեր|գնորդ|клиент|партнер|покупат|контрагент|customer|client/],
  ["sales_total", /վաճառ|продаж|продал|выручк|շրջանառ|հասույթ|եկամուտ|sales|sold|revenue/],
];

const MONTHS: RegExp[] = [
  /հունվար|январ|january/,
  /փետրվար|феврал|february/,
  /մարտ|март|march/,
  /ապրիլ|апрел|april/,
  /մայիս|мая|май|may/,
  /հունիս|июн|june/,
  /հուլիս|июл|july/,
  /օգոստոս|август|august/,
  /սեպտեմբեր|сентябр|september/,
  /հոկտեմբեր|октябр|october/,
  /նոյեմբեր|ноябр|november/,
  /դեկտեմբեր|декабр|december/,
];

const day = (y: number, m: number, d: number) => isoDate(new Date(y, m, d));

// Period mentioned in the question; null = none mentioned.
export const parsePeriod = (q: string, now = new Date()): { start: string; end: string } | null => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = isoDate(now);
  const last = /անցյալ|նախորդ|прошл|last |previous/;

  const lastDays = q.match(/վերջին (\d{1,3}) օր|последн\S* (\d{1,3}) дн|last (\d{1,3}) days/);
  if (lastDays) {
    const n = Math.min(Number(lastDays[1] ?? lastDays[2] ?? lastDays[3]), 366);
    return { start: isoDate(new Date(y, m, now.getDate() - n + 1)), end: today };
  }
  if (has(q, /այսօր|сегодня|today/)) return { start: today, end: today };
  if (has(q, /երեկ|вчера|yesterday/)) {
    const d = isoDate(new Date(y, m, now.getDate() - 1));
    return { start: d, end: d };
  }
  const monday = now.getDate() - ((now.getDay() + 6) % 7);
  if (has(q, /շաբաթ|недел|week/)) {
    return has(q, last)
      ? { start: day(y, m, monday - 7), end: day(y, m, monday - 1) }
      : { start: day(y, m, monday), end: today };
  }

  const yearMatch = q.match(/(20\d\d)/);
  const monthIdx = MONTHS.findIndex((re) => re.test(q));
  if (monthIdx >= 0) {
    // The last such month that is not in the future.
    const year = yearMatch ? Number(yearMatch[1]) : monthIdx > m ? y - 1 : y;
    const end = day(year, monthIdx + 1, 0);
    return { start: day(year, monthIdx, 1), end: end > today ? today : end };
  }
  if (has(q, /ամս|ամիս|месяц|month/)) {
    return has(q, last) ? { start: day(y, m - 1, 1), end: day(y, m, 0) } : { start: day(y, m, 1), end: today };
  }
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return { start: day(year, 0, 1), end: year === y ? today : day(year, 11, 31) };
  }
  if (has(q, /տարի|տարվա|год|year/)) {
    return has(q, last) ? { start: day(y - 1, 0, 1), end: day(y - 1, 11, 31) } : { start: day(y, 0, 1), end: today };
  }
  return null;
};

// Built-in rules: a data question in Armenian, Russian or English, or null
// when the question is for the knowledge base.
export const parseDataQuestion = (question: string, now = new Date()): DataIntent | null => {
  const q = clean(question);
  if (has(q, HOW_TO)) return null;

  let topic = TOPICS.find(([, re]) => re.test(q))?.[0];
  if (!topic) return null;

  const period = parsePeriod(q, now);
  // Debts and lost customers are specific enough on their own.
  const specific = topic === "debts" || topic === "overdue" || topic === "inactive_customers";
  if (!specific && !has(q, ASKS_DATA) && !period) return null;

  // "Who sold the most" = managers, "who bought the most" = customers.
  if (topic === "sales_total" && has(q, / ով | ովքեր| кто | who /)) topic = "sales_by_manager";
  if (topic === "sales_total" && has(q, /գնել|գնում|купил|покупа|bought/)) topic = "sales_by_partner";

  const intent: DataIntent = { topic };
  if (period) Object.assign(intent, period);
  if (has(q, /ամենաքիչ|ամենացածր|ամենավատ|վատագույն|меньше всего|наимень|худш|least|worst/)) intent.order = "asc";

  const limit = q.match(/(?:թոփ|top|топ)\s*(\d{1,2})|(\d{1,2})\s*(?:ամենա|լավագույն|հատ|ապրանք|հաճախորդ|մենեջեր|самых|лучших|товар|клиент)/);
  if (limit) intent.limit = Math.min(Math.max(Number(limit[1] ?? limit[2]), 1), 50);

  if (topic === "inactive_customers") {
    const days = q.match(/(\d{1,3})\s*(?:օր|дн|day)/);
    const months = q.match(/(\d{1,2})\s*(?:ամիս|месяц|month)/);
    intent.days = days ? Number(days[1]) : months ? Number(months[1]) * 30 : 30;
    // "30 days" here is the threshold, not the sales period.
    delete intent.start;
    delete intent.end;
  }
  return intent;
};

// "How do I ..." questions skip the numbers and go straight to the knowledge base.
export const looksLikeHowTo = (question: string) => HOW_TO.test(clean(question));
