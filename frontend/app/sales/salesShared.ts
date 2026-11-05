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

// Backend errors come as "Request failed (502): {json}"; show their message in Armenian.
const MESSAGES: Record<string, string> = {
  "E-invoicing account is not set up": "ՊԵԿ-ի e-invoicing հաշիվը կարգավորված չէ։ Ադմինկայում (DB entries) լրացրեք ՀՎՀՀ, login և գաղտնաբառ։",
  "Taxpayer not found": "Այս ՀՎՀՀ-ով հարկ վճարող չգտնվեց",
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
