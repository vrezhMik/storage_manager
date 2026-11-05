"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import { API_BASE, authFetch } from "../../lib/auth";
import { formatAmount } from "../../reports/sales/salesData";
import { cardClass, CONFIRM_SIGN, DocType, errorText, SignMethod, TYPE_LABELS } from "../salesShared";

// The form for a new account document (հաշիվ-վավերագիր): saved in e-invoicing
// as a draft, and signed right away when the user has a signing method.

type Row = { name: string; classifierCode: string; unit: string; quantity: string; unitPrice: string };
const TYPES = (Object.keys(TYPE_LABELS) as DocType[]).map((type) => ({ type, label: TYPE_LABELS[type] }));

const inputClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const emptyRow = (): Row => ({ name: "", classifierCode: "", unit: "հատ", quantity: "", unitPrice: "" });
const num = (s: string) => {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const rowTotal = (r: Row) => Math.round(num(r.quantity) * num(r.unitPrice) * 100) / 100;

export function SalesFormView() {
  const router = useRouter();
  const [type, setType] = useState<DocType>("ACC_DOC_GOODS");
  const [buyerTin, setBuyerTin] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [deliveredAt, setDeliveredAt] = useState(today);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [lookup, setLookup] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [signMethod, setSignMethod] = useState<SignMethod | null>(null);
  const canSign = signMethod !== null;

  const goods = type === "ACC_DOC_GOODS";
  const total = rows.reduce((s, r) => s + rowTotal(r), 0);

  // Only to know whether the user can sign (and how).
  useEffect(() => {
    authFetch<{ signMethod?: SignMethod | null }>(`${API_BASE}/sales/documents`)
      .then((res) => setSignMethod(res?.signMethod ?? null))
      .catch(() => setSignMethod(null));
  }, []);

  const findBuyer = async () => {
    if (!/^\d{8}$/.test(buyerTin)) {
      setLookup({ busy: false, error: "ՀՎՀՀ-ն պետք է լինի 8 թիվ" });
      return;
    }
    setLookup({ busy: true, error: null });
    try {
      const res = await authFetch<{ name?: string; address?: string }>(`${API_BASE}/sales/taxpayer?tin=${buyerTin}`);
      setBuyerName(res?.name ?? "");
      setBuyerAddress(res?.address ?? "");
      setLookup({ busy: false, error: null });
    } catch (err) {
      setLookup({ busy: false, error: errorText(err) });
    }
  };

  const updateRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const problems = [
    !/^\d{8}$/.test(buyerTin) && "Գնորդի ՀՎՀՀ-ն (8 թիվ)",
    !deliveredAt && "Մատակարարման ամսաթիվը",
    rows.some((r) => !r.name.trim()) && "Բոլոր տողերի անվանումը",
    goods && rows.some((r) => !r.classifierCode.trim()) && "Բոլոր տողերի ԱՏԳ ԱԱ կոդը",
    rows.some((r) => !r.unit.trim()) && "Բոլոր տողերի միավորը",
    rows.some((r) => num(r.quantity) <= 0) && "Բոլոր տողերի քանակը",
    rows.some((r) => num(r.unitPrice) < 0 || r.unitPrice.trim() === "") && "Բոլոր տողերի գինը",
  ].filter(Boolean) as string[];

  const send = async (sign: boolean) => {
    if (problems.length > 0 || sending) return;
    if (sign && !window.confirm(CONFIRM_SIGN)) return;
    setSending(true);
    setResult(null);
    try {
      await authFetch(`${API_BASE}/sales/documents`, {
        method: "POST",
        body: JSON.stringify({
          type,
          buyerTin,
          buyerName: buyerName || null,
          buyerAddress: buyerAddress || null,
          deliveredAt,
          additionalInfo: additionalInfo || null,
          sign,
          items: rows.map((r) => ({
            name: r.name.trim(),
            classifierCode: goods ? r.classifierCode.trim() : null,
            unit: r.unit.trim(),
            quantity: num(r.quantity),
            unitPrice: num(r.unitPrice),
          })),
        }),
      });
      // Saved: back to the list, which follows the signing.
      router.push((sign ? "/sales/" : "/sales/?created=1") as Route);
      return;
    } catch (err) {
      // The draft was saved but signing did not start: the list shows why.
      if (/"id":s*d+/.test(String((err as Error)?.message))) {
        router.push("/sales/" as Route);
        return;
      }
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className={`${cardClass} space-y-3`}>
              <div>
                <Link href={"/sales" as Route} className="text-xs font-medium text-primary hover:underline">
                  ← Վաճառքներ
                </Link>
                <h2 className="text-xl font-semibold text-foreground">Նոր հաշիվ-վավերագիր</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => setType(t.type)}
                    aria-pressed={type === t.type}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      type === t.type ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${cardClass} space-y-3`}>
              <h3 className="font-semibold text-foreground">Գնորդ</h3>
              <div className="grid gap-3 md:grid-cols-[12rem_auto_1fr]">
                <input
                  value={buyerTin}
                  onChange={(e) => setBuyerTin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={(e) => e.key === "Enter" && findBuyer()}
                  inputMode="numeric"
                  placeholder="ՀՎՀՀ (8 թիվ)"
                  className={inputClass}
                  aria-label="Գնորդի ՀՎՀՀ"
                />
                <button
                  type="button"
                  onClick={findBuyer}
                  disabled={lookup.busy}
                  className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  {lookup.busy ? "Որոնում…" : "Գտնել ՊԵԿ-ում"}
                </button>
                <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Անվանում" className={inputClass} aria-label="Գնորդի անվանում" />
              </div>
              <input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Հասցե" className={inputClass} aria-label="Գնորդի հասցե" />
              {lookup.error && <p className="text-sm text-red-600">{lookup.error}</p>}
              <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Մատակարարման ամսաթիվ</span>
                  <input type="date" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} className={inputClass} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Լրացուցիչ տեղեկություն (ոչ պարտադիր)</span>
                  <input value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} className={inputClass} />
                </label>
              </div>
            </div>

            <div className={`${cardClass} space-y-3`}>
              <h3 className="font-semibold text-foreground">{goods ? "Ապրանքներ" : "Ծառայություններ"}</h3>
              <div className="space-y-3">
                <div className="hidden gap-2 text-xs font-semibold text-muted-foreground md:grid md:grid-cols-[2rem_1fr_9rem_6rem_6rem_8rem_8rem_2rem]">
                  <span>#</span>
                  <span>Անվանում</span>
                  <span>{goods ? "ԱՏԳ ԱԱ կոդ" : ""}</span>
                  <span>Միավոր</span>
                  <span>Քանակ</span>
                  <span>Գին</span>
                  <span className="text-right">Գումար</span>
                  <span />
                </div>
                {rows.map((r, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[2rem_1fr_9rem_6rem_6rem_8rem_8rem_2rem] md:items-center md:border-0 md:p-0">
                    <span className="hidden text-sm text-muted-foreground md:block">{i + 1}.</span>
                    <input value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} placeholder="Անվանում" className={inputClass} aria-label="Անվանում" />
                    {goods ? (
                      <input
                        value={r.classifierCode}
                        onChange={(e) => updateRow(i, { classifierCode: e.target.value.replace(/\s/g, "") })}
                        placeholder="ԱՏԳ ԱԱ կոդ"
                        inputMode="numeric"
                        className={inputClass}
                        aria-label="ԱՏԳ ԱԱ կոդ"
                      />
                    ) : (
                      <span className="hidden md:block" />
                    )}
                    <input value={r.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} placeholder="Միավոր" className={inputClass} aria-label="Միավոր" />
                    <input value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} placeholder="Քանակ" inputMode="decimal" className={inputClass} aria-label="Քանակ" />
                    <input value={r.unitPrice} onChange={(e) => updateRow(i, { unitPrice: e.target.value })} placeholder="Գին" inputMode="decimal" className={inputClass} aria-label="Գին" />
                    <span className="text-right text-sm font-semibold tabular-nums">
                      <span className="mr-1 font-normal text-muted-foreground md:hidden">Գումար՝</span>
                      {formatAmount(rowTotal(r))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [emptyRow()]))}
                      className="justify-self-end rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-red-50 hover:text-red-700"
                      aria-label="Ջնջել տողը"
                      title="Ջնջել տողը"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])} className="text-sm font-medium text-primary hover:underline">
                  + Ավելացնել տող
                </button>
                <span className="text-base">
                  Ընդամենը՝ <b className="tabular-nums">{formatAmount(total)}</b>
                </span>
              </div>
            </div>

            <div className={`${cardClass} space-y-3`}>
              {problems.length > 0 && (
                <p className="text-sm text-muted-foreground">Լրացրեք՝ {problems.join(", ")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {canSign && (
                  <button
                    type="button"
                    onClick={() => send(true)}
                    disabled={problems.length > 0 || sending}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sending ? "Ուղարկվում է…" : "✍ Ստեղծել և ստորագրել"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => send(false)}
                  disabled={problems.length > 0 || sending}
                  className={`inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium shadow disabled:opacity-50 ${
                    canSign ? "border border-input hover:bg-accent" : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {sending && !canSign ? "Ուղարկվում է…" : "Միայն սևագիր"}
                </button>
              </div>
              {!canSign && (
                <p className="text-xs text-muted-foreground">
                  Տերմինալից ստորագրելու համար ադմինկայում (Users) լրացրեք CoSign, Mobile ID կամ Նիկիտա։
                </p>
              )}
              {result && (
                <p className={`rounded-md px-3 py-2 text-sm ${result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {result.ok ? "✓ " : "✕ "}
                  {result.text}
                </p>
              )}
            </div>

          </div>
        </main>
      </div>
    </>
  );
}

export default function SalesFormClient() {
  return (
    <AuthGuard section="sales">
      <SalesFormView />
    </AuthGuard>
  );
}
