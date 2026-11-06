import { API_BASE, authFetch } from "../lib/auth";
import { deviceLogin, DocType, SignMethod, srcFetch } from "./salesShared";

// "Վաճառքներ" in the Flexit apps: the device itself talks to the tax service
// (its own IP) and the terminal server only records the results. Mirrors
// backend/app/Services/Einvoice/EinvoiceClient.php.

export type DraftInput = {
  type: DocType;
  buyerTin: string;
  buyerName: string | null;
  buyerAddress: string | null;
  deliveredAt: string;
  additionalInfo: string | null;
  items: { name: string; classifierCode: string | null; unit: string; quantity: number; unitPrice: number }[];
};

const DRAFT_PATHS: Record<DocType, string> = {
  ACC_DOC_GOODS: "acc-doc-goods/acc-doc-goods-create-draft",
  ACC_DOC_SERVICES: "acc-doc-services/acc-doc-services-create-draft",
};

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

const round2 = (n: number) => Math.round(n * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ԱՏԳ ԱԱ code -> the tax service's classifier id (kept for a day).
const CLASSIFIER_KEY = "flexit-einvoice-classifier";
let classifier: Record<string, string> | null = null;

const classifierIds = async (): Promise<Record<string, string>> => {
  if (classifier) return classifier;
  try {
    const saved = JSON.parse(localStorage.getItem(CLASSIFIER_KEY) ?? "null");
    if (saved && Date.now() - saved.at < 24 * 3600 * 1000) return (classifier = saved.map as Record<string, string>);
  } catch {
    /* load it again */
  }
  const answer = await srcFetch("dictionaries/classifier-list", {});
  if (!answer.ok || !Array.isArray(answer.payload)) {
    throw new Error(`Could not load the ԱՏԳ ԱԱ classifier: ${answer.failure?.message ?? "unknown error"}`);
  }
  const map: Record<string, string> = {};
  (answer.payload as { id?: unknown; code?: unknown }[]).forEach((row) => {
    if (row.id != null && row.code != null) map[String(row.code)] = String(row.id);
  });
  try {
    localStorage.setItem(CLASSIFIER_KEY, JSON.stringify({ at: Date.now(), map }));
  } catch {
    /* only a cache */
  }
  return (classifier = map);
};

/**
 * Sends the draft from the device and returns what the server should record.
 */
export const createDraftOnDevice = async (doc: DraftInput) => {
  const id = uuid();
  const login = await deviceLogin(false);
  const supplierAnswer = await srcFetch("tpinfo/tp-info-by-tin", { tin: login.tin, checkDate: new Date().toISOString() }).catch(() => null);
  const supplier = (supplierAnswer?.ok ? supplierAnswer.payload : null) as Record<string, unknown> | null;
  const ids = doc.type === "ACC_DOC_GOODS" ? await classifierIds() : {};

  let total = 0;
  const items = doc.items.map((item, i) => {
    const value = round2(item.quantity * item.unitPrice);
    total += value;
    const row: Record<string, unknown> = {
      mode: "new",
      id: uuid(),
      invoiceId: id,
      seqNo: i + 1,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalValue: value,
    };
    if (doc.type === "ACC_DOC_GOODS") {
      const classifierId = ids[String(item.classifierCode ?? "").trim()];
      if (!classifierId) throw new Error(`ԱՏԳ ԱԱ code ${item.classifierCode} is not in the tax service classifier (row ${i + 1})`);
      row.classifierId = classifierId;
    }
    return row;
  });

  const payload: Record<string, unknown> = {
    id,
    status: "DRAFT",
    deliveredAt: `${doc.deliveredAt}T00:00:00.000Z`,
    supplierTin: login.tin,
    buyerHasNoTin: false,
    buyerIsNatural: false,
    buyerTin: doc.buyerTin,
    items,
    totalValue: round2(total),
    tin: login.tin,
  };
  if (doc.additionalInfo) payload.additionalInfo = doc.additionalInfo;
  if (supplier?.name ?? supplier?.taxpayerName) payload.supplierName = supplier?.name ?? supplier?.taxpayerName;
  if (supplier?.address ?? supplier?.legalAddress) payload.supplierAddress = supplier?.address ?? supplier?.legalAddress;
  if (doc.buyerName) payload.buyerName = doc.buyerName;
  if (doc.buyerAddress) payload.buyerAddress = doc.buyerAddress;

  const answer = await srcFetch(DRAFT_PATHS[doc.type], payload);
  return {
    srcId: id,
    ok: answer.ok,
    error: answer.ok ? null : answer.failure?.message ?? answer.failure?.code ?? "Rejected by e-invoicing",
    response: answer as unknown as Record<string, unknown>,
  };
};

const SIGN_PATHS: Record<SignMethod, string> = {
  cosign: "dispatcher/issue-co-sign",
  mobile_id: "dispatcher/issue-mts",
  nikita: "dispatcher/issue-nikita",
};

const signTask = async (requestId: string) => {
  const answer = await srcFetch("dispatcher/sign-task-by-id", { id: requestId });
  return (answer.payload ?? {}) as { state?: string; failMessage?: string; signedAt?: string };
};

/**
 * Starts signing a draft from the device and tells the server. Mobile ID and
 * Nikita then wait for the signer to confirm on the phone.
 */
export const startSigningOnDevice = async (docId: number, srcId: string) => {
  const signer = await authFetch<{ method: SignMethod; username?: string; password?: string; phone?: string }>(`${API_BASE}/sales/sign-info`);
  const requestId = uuid();

  const issue = await srcFetch("dispatcher/request-issue", { requestId, ids: srcId });
  if (!issue.ok) throw new Error(`The tax service did not accept the document for signing: ${issue.failure?.message ?? "unknown error"}`);

  for (let i = 0; ; i++) {
    const task = await signTask(requestId);
    if (task.state === "FAILED" || task.state === "SIGN_FAILED") throw new Error(`Signing failed${task.failMessage ? `: ${task.failMessage}` : ""}`);
    if (task.state && ["SIGN_WAITING", "SIGN_PROCESSING", "SIGNED"].includes(task.state)) break;
    if (i >= 14) throw new Error("The tax service did not prepare the document for signing in time. Try again in a minute.");
    await sleep(1500);
  }

  const sign = await srcFetch(
    SIGN_PATHS[signer.method],
    signer.method === "cosign" ? { requestId, username: signer.username, password: signer.password } : { requestId, phone: signer.phone },
  );
  if (!sign.ok) throw new Error(`Signing request failed: ${sign.failure?.message ?? sign.failure?.code ?? "unknown error"}`);

  await authFetch(`${API_BASE}/sales/documents/${docId}/device-sign`, {
    method: "POST",
    body: JSON.stringify({ state: "STARTED", requestId, method: signer.method }),
  });
  return { requestId, method: signer.method };
};

/**
 * One look at a document being signed; reports SIGNED / FAILED to the server.
 * Returns the server's answer, or null while still waiting.
 */
export const checkSigningOnDevice = async (docId: number, requestId: string, srcId: string) => {
  const task = await signTask(requestId);
  let result: Record<string, unknown> | null = null;
  if (task.state === "FAILED" || task.state === "SIGN_FAILED") {
    result = { state: "FAILED", message: `Signing failed${task.failMessage ? `: ${task.failMessage}` : ""}` };
  } else if (task.state === "SIGNED") {
    const items = await srcFetch("dispatcher/sign-task-item-by-invoice-id", { id: srcId });
    const rows = (Array.isArray(items.payload) ? items.payload : []) as { signTaskId?: string; serialNo?: string; failMessage?: string }[];
    const item = rows.find((r) => r.signTaskId === requestId) ?? rows[rows.length - 1] ?? {};
    result = item.failMessage
      ? { state: "FAILED", message: item.failMessage }
      : { state: "SIGNED", serialNo: item.serialNo ?? null, signedAt: task.signedAt ?? null };
  }
  if (!result) return null;
  return authFetch<{ status: string; serialNo?: string | null; error?: string | null }>(`${API_BASE}/sales/documents/${docId}/device-sign`, {
    method: "POST",
    body: JSON.stringify(result),
  });
};
