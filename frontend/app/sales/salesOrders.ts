import { API_BASE, authFetch } from "../lib/auth";
import { nativeBridge } from "../lib/device";

// Sales kept in the terminal ("Պահպանել") and sent to 1C as customer orders
// ("Ուղարկել 1C"); see SalesOrderController.

export type OrderStatus = "DRAFT" | "FAILED" | "SENT";

export type OrderItem = {
  code: string;
  name: string;
  unit: string | null;
  classifierCode: string | null;
  image: string | null;
  quantity: number;
  price: number;
};

export type SalesOrder = {
  id: number;
  status: OrderStatus;
  buyerTin: string | null;
  buyerName: string;
  buyerAddress: string | null;
  deliveredAt: string | null;
  comment: string | null;
  items: OrderItem[];
  total: number;
  onecNumber: string | null;
  error: string | null;
  user: string | null;
  sentAt: string | null;
  createdAt: string | null;
};

export type OrderInput = Pick<SalesOrder, "buyerTin" | "buyerName" | "buyerAddress" | "deliveredAt" | "comment"> & {
  items: Omit<OrderItem, never>[];
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Սևագիր",
  FAILED: "Չուղարկվեց",
  SENT: "1C-ում է",
};

export const loadOrders = () => authFetch<{ orders: SalesOrder[] }>(`${API_BASE}/sales/orders`).then((r) => r.orders);

export const loadOrder = (id: number) => authFetch<SalesOrder>(`${API_BASE}/sales/orders/${id}`);

export const saveOrder = (input: OrderInput, id?: number) =>
  authFetch<SalesOrder>(`${API_BASE}/sales/orders${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(input),
  });

export const deleteOrder = (id: number) => authFetch(`${API_BASE}/sales/orders/${id}`, { method: "DELETE" });

const KNOWN: [RegExp, string][] = [
  [/No 1C sales order endpoint/, "1C-ին ուղարկելու հասցեն կարգավորված չէ (ադմինկա → DB Config → API: Sales order)։"],
  [/already in 1C/, "Այս վաճառքն արդեն 1C-ում է և չի կարող փոխվել։"],
  [/No DB config/, "Օգտատիրոջը DB Config կցված չէ։"],
];

// What to show when saving or sending failed.
export const errorMessage = (err: unknown): string => {
  const text = String((err as Error)?.message ?? "");
  const known = KNOWN.find(([re]) => re.test(text));
  if (known) return known[1];
  if (/\(422\)/.test(text)) return "Ստուգեք գնորդի և ապրանքների տվյալները։";
  return "Չհաջողվեց. ստուգեք ինտերնետը և կրկին փորձեք։";
};

// A refused sale comes back as 502 with the sale (and 1C's reason) in the body.
const orderFromError = (err: unknown): SalesOrder | null => {
  const match = String((err as Error)?.message ?? "").match(/^Request failed \(\d+\): ([\s\S]*)$/);
  try {
    const body = match ? JSON.parse(match[1]) : null;
    return body && typeof body.id === "number" ? (body as SalesOrder) : null;
  } catch {
    return null;
  }
};

/**
 * Sends a saved sale to 1C. Network-restricted users in the apps get the
 * request from the server, send it from the device and report 1C's answer.
 */
export const sendOrder = async (id: number): Promise<SalesOrder> => {
  const native = nativeBridge();
  try {
    const res = await authFetch<SalesOrder & { device?: { url: string; method: string; headers: Record<string, string>; body: string } }>(
      `${API_BASE}/sales/orders/${id}/send${native ? "?device=1" : ""}`,
      { method: "POST" },
    );
    if (!res.device || !native) return res;

    let report: Record<string, unknown>;
    try {
      const answer = await native.request({ ...res.device, timeoutMs: 60000 });
      report = { status: answer.status, body: answer.body };
    } catch (err) {
      report = { error: `1C-ին չհաջողվեց հասնել. ${(err as Error).message}` };
    }
    return await authFetch<SalesOrder>(`${API_BASE}/sales/orders/${id}/device-result`, {
      method: "POST",
      body: JSON.stringify(report),
    });
  } catch (err) {
    const order = orderFromError(err);
    if (order) return order;
    throw err;
  }
};
