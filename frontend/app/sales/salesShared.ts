// Shared by the documents list (/sales) and the form (/sales/new).

export type DocType = "ACC_DOC_GOODS" | "ACC_DOC_SERVICES";
export type SignMethod = "cosign" | "mobile_id" | "nikita";
export type DocStatus = "DRAFT" | "FAILED" | "SIGNING" | "ISSUED";

export type SentDoc = {
  id: number;
  type: DocType;
  status: DocStatus;
  serialNo: string | null;
  buyerTin: string | null;
  buyerName: string | null;
  deliveredAt: string | null;
  total: number;
  error: string | null;
  user: string | null;
  createdAt: string | null;
};

export type SignAnswer = { id: number; status: DocStatus; signMethod?: SignMethod | null; serialNo?: string | null; error?: string | null };

export const TYPE_LABELS: Record<DocType, string> = {
  ACC_DOC_GOODS: "Ապրանքների հաշիվ-վավերագիր",
  ACC_DOC_SERVICES: "Ծառայությունների հաշիվ-վավերագիր",
};

export const CONFIRM_SIGN = "Փաստաթուղթը կստորագրվի ձեր ստորագրությամբ և կդուրսգրվի ՊԵԿ-ում։ Շարունակե՞լ։";

// What the signer has to do while a document is SIGNING.
export const SIGNING_TEXT: Record<SignMethod, string> = {
  cosign: "Ստորագրվում է…",
  mobile_id: "Հաստատեք ստորագրումը հեռախոսում (Mobile ID)…",
  nikita: "Հաստատեք ստորագրումը Նիկիտա հավելվածում…",
};

export const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";

// Calls the tax service's e-invoicing API straight from the employee's
// browser, with the e-invoicing session they opened on file-online.taxservice.am
// (its jwt-auth-token cookie): the tax service sees the employee's own IP,
// not the terminal server's.
export const SRC_API = "https://e-invoicing.taxservice.am/api";
export const SRC_LOGIN_PAGE = "https://file-online.taxservice.am";

export type SrcAnswer = { ok: boolean; payload: unknown; failure?: { code?: string; message?: string } | null };

export class SrcSessionError extends Error {}

// The "Flexit ՊԵԿ կապ" Chrome extension (tools/chrome-extension) marks the
// page; a plain browser page cannot send the e-invoicing session itself.
export const hasSrcExtension = () => typeof document !== "undefined" && document.documentElement.dataset.flexitSrc === "1";

// Sends the request through the extension; resolves with {status, body}.
const viaExtension = (path: string, payload: Record<string, unknown>) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const id = `${Date.now()}-${Math.random()}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The extension did not answer"));
    }, 30000);
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.data?.type !== "FLEXIT_SRC_RESPONSE" || event.data.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve({ status: event.data.status, body: event.data.body ?? "" });
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "FLEXIT_SRC_REQUEST", id, path, payload }, window.location.origin);
  });

export const srcFetch = async (path: string, payload: Record<string, unknown>): Promise<SrcAnswer> => {
  let status: number;
  let text: string;
  if (hasSrcExtension()) {
    ({ status, body: text } = await viaExtension(path, payload));
  } else {
    const res = await fetch(`${SRC_API}/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ payload }),
    });
    status = res.status;
    text = await res.text();
  }
  if (status === 401 || status === 403 || /JWT token is not provided/i.test(text)) {
    throw new SrcSessionError(`Not signed in to e-invoicing (HTTP ${status})`);
  }
  try {
    return JSON.parse(text) as SrcAnswer;
  } catch {
    throw new Error(`Unexpected answer from e-invoicing (HTTP ${status}): ${text.slice(0, 200)}`);
  }
};

// Backend errors come as "Request failed (502): {json}"; show their message in Armenian.
const MESSAGES: Record<string, string> = {
  "E-invoicing account is not set up": "ՊԵԿ-ի e-invoicing հաշիվը կարգավորված չէ։ Ադմինկայում (DB entries) լրացրեք ՀՎՀՀ, login և գաղտնաբառ։",
  "Taxpayer not found": "Այս ՀՎՀՀ-ով հարկ վճարող չգտնվեց",
  "The tax service login (ews.taxservice.am) is not reachable from this server":
    "ՊԵԿ-ի մուտքի սերվերը (ews.taxservice.am) հասանելի չէ տերմինալի սերվերից։ ՊԵԿ-ը ընդունում է միայն Հայաստանից եկող հարցումներ։",
  "E-invoicing (e-invoicing.taxservice.am) is not reachable from this server": "ՊԵԿ-ի e-invoicing համակարգը հասանելի չէ տերմինալի սերվերից",
  "Login to e-invoicing failed": "ՊԵԿ-ի e-invoicing մուտքը չհաջողվեց. ստուգեք login-ը և գաղտնաբառը ադմինկայում",
  "No signing method for this user": "Ստորագրման եղանակը կարգավորված չէ։ Ադմինկայում (Users) լրացրեք CoSign, Mobile ID կամ Նիկիտա։",
  "Signing failed": "Ստորագրումը չհաջողվեց, փաստաթուղթը մնացել է սևագիր",
  "Signing request failed": "Ստորագրման հարցումը չհաջողվեց, փաստաթուղթը մնացել է սևագիր",
  "Signing was not confirmed in time": "Ստորագրումը ժամանակին չհաստատվեց, փաստաթուղթը մնացել է սևագիր",
  "The tax service did not prepare the document for signing in time": "ՊԵԿ-ը ժամանակին չպատրաստեց փաստաթուղթը ստորագրման համար։ Փորձեք մեկ րոպեից։",
};

export const errorText = (err: unknown) => {
  const raw = typeof err === "string" ? err : String((err as Error)?.message ?? "");
  let message = raw;
  const json = raw.indexOf("{");
  if (json >= 0) {
    try {
      const body = JSON.parse(raw.slice(json));
      message = body.error || body.message || raw;
    } catch {
      /* keep raw */
    }
  }
  const known = Object.keys(MESSAGES).find((k) => message.startsWith(k));
  return known ? `${MESSAGES[known]}${message.length > known.length ? ` (${message})` : ""}` : message || "Չհաջողվեց";
};
