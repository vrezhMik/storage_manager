import { errorText } from "../salesShared";

// "ՀԴՄ կտրոններ": receipts printed through the company's electronic cash
// register (e-ՀԴՄ) at the tax service.

export type HdmMode = "off" | "mock" | "test" | "live";

export type HdmItem = {
  goodName: string;
  goodCode?: string;
  adgCode?: string;
  unit?: string;
  quantity: number;
  price?: number;
  discount?: number;
  discountType?: number;
  receiptProductId?: number;
};

export type HdmReceipt = {
  id: number;
  type: "SALE" | "RETURN";
  mode: HdmMode;
  status: "OK" | "FAILED";
  receiptId: string | null;
  fiscal: string | null;
  partnerTin: string | null;
  cash: number;
  card: number;
  total: number;
  returnOfId: number | null;
  returnedTotal: number;
  error: string | null;
  user: string | null;
  printedAt: string | null;
  // Only on a single receipt:
  crn?: string | null;
  sn?: string | null;
  tin?: string | null;
  taxpayer?: string | null;
  address?: string | null;
  change?: number;
  qr?: string | null;
  items?: HdmItem[];
  returnOfReceiptId?: string | null;
  copy?: boolean;
};

export const MODE_NOTICE: Partial<Record<HdmMode, string>> = {
  mock: "Փորձարկման ռեժիմ (mock). կտրոնները ՊԵԿ չեն ուղարկվում և իրական չեն։",
  test: "ՊԵԿ-ի թեստային համակարգ. կտրոնները իրական չեն։",
};

// "e-HDM error 152 PAID_AMOUNT_LESS_THAN_TOTAL: <Armenian text>" -> the Armenian text.
export const hdmError = (err: unknown) => {
  const text = errorText(err);
  if (text.startsWith("e-HDM is not set up")) {
    return "e-ՀԴՄ-ն կարգավորված չէ։ Ադմինկայում (DB entries) ընտրեք e-ՀԴՄ ռեժիմը։";
  }
  if (text.startsWith("The e-HDM service is not reachable")) {
    return "ՊԵԿ-ի e-ՀԴՄ ծառայությունը հասանելի չէ սերվերից։";
  }
  const m = /^e-HDM error (\d+)(?: [A-Z_]+)?: ([\s\S]*)$/.exec(text);
  return m ? `${m[2]} (կոդ ${m[1]})` : text;
};

export const round2 = (n: number) => Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;

export const num = (s: string) => {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
