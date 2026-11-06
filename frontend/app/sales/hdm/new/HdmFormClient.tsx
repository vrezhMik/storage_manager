"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "../../../components/AuthGuard";
import { API_BASE, authFetch } from "../../../lib/auth";
import { formatAmount } from "../../../reports/sales/salesData";
import { cardClass } from "../../salesShared";
import EmarkScanner, { showEmark } from "../EmarkScanner";
import { hdmError, HdmMode, HdmReceipt, MODE_NOTICE, num, round2 } from "../hdmShared";

// A new cash register receipt (e-ՀԴՄ): goods, payment, and the buyer's TIN
// when the buyer is a company.

// emarks: the scanned eMark codes, one per unit; with codes the quantity is their count.
type Row = { goodName: string; goodCode: string; adgCode: string; unit: string; quantity: string; price: string; discount: string; emarks: string[] };

const inputClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const emptyRow = (): Row => ({ goodName: "", goodCode: "", adgCode: "", unit: "հատ", quantity: "1", price: "", discount: "", emarks: [] });
const rowTotal = (r: Row) => round2(num(r.quantity) * num(r.price) * (1 - Math.min(num(r.discount), 99.99) / 100));
const decimals = (s: string) => (String(s).replace(",", ".").split(".")[1] ?? "").length;

type Payment = "cash" | "card" | "mixed";

export function HdmFormView() {
  const router = useRouter();
  const [mode, setMode] = useState<HdmMode>("off");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [partnerTin, setPartnerTin] = useState("");
  const [payment, setPayment] = useState<Payment>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [cardPart, setCardPart] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState<number | null>(null);

  useEffect(() => {
    authFetch<{ mode: HdmMode }>(`${API_BASE}/sales/ehdm`)
      .then((res) => setMode(res?.mode ?? "off"))
      .catch(() => setMode("off"));
  }, []);

  const total = round2(rows.reduce((s, r) => s + rowTotal(r), 0));
  const card = payment === "card" ? total : payment === "mixed" ? round2(num(cardPart)) : 0;
  const cash = payment === "card" ? 0 : cashGiven.trim() === "" ? round2(total - card) : round2(num(cashGiven));
  const change = round2(cash + card - total);

  const updateRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setEmarks = (i: number, emarks: string[]) => updateRow(i, { emarks, quantity: String(Math.max(emarks.length, 1)) });
  const takenElsewhere = (i: number) => new Set(rows.flatMap((r, j) => (j === i ? [] : r.emarks)));

  const problems: string[] = [];
  rows.forEach((r, i) => {
    const n = rows.length > 1 ? ` (տող ${i + 1})` : "";
    if (!r.goodName.trim()) problems.push(`անվանում${n}`);
    if (!/^\d{2,}[\d.]*$/.test(r.adgCode)) problems.push(`ԱՏԳ կոդ${n}`);
    if (!r.unit.trim()) problems.push(`միավոր${n}`);
    if (num(r.quantity) <= 0 || decimals(r.quantity) > 3) problems.push(`քանակ${n}`);
    if (num(r.price) <= 0 || decimals(r.price) > 2) problems.push(`գին${n}`);
    if (num(r.discount) < 0 || num(r.discount) >= 100) problems.push(`զեղչ${n}`);
  });
  if (partnerTin && !/^\d{8}$/.test(partnerTin)) problems.push("գնորդի ՀՎՀՀ (8 թիվ)");
  if (card > total) problems.push("անկանխիկը մեծ է ընդհանուրից");
  if (cash + card < total - 0.001) problems.push("վճարված գումարը քիչ է");

  const send = async () => {
    if (sending || problems.length > 0) return;
    if (!window.confirm(`Տպե՞լ ՀԴՄ կտրոն ${formatAmount(total)} դրամով։`)) return;
    setSending(true);
    setError(null);
    try {
      const receipt = await authFetch<HdmReceipt>(`${API_BASE}/sales/ehdm/receipts`, {
        method: "POST",
        body: JSON.stringify({
          partnerTin: partnerTin || null,
          cashAmount: cash,
          cardAmount: card,
          items: rows.map((r) => ({
            goodName: r.goodName.trim(),
            goodCode: r.goodCode.trim() || null,
            adgCode: r.adgCode,
            unit: r.unit.trim(),
            quantity: num(r.quantity),
            price: num(r.price),
            discount: num(r.discount) || null,
            emarks: r.emarks.length > 0 ? r.emarks : null,
          })),
        }),
      });
      router.push(`/sales/hdm?receipt=${receipt.id}` as Route);
    } catch (err) {
      setError(hdmError(err));
      setSending(false);
    }
  };

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Նոր ՀԴՄ կտրոն</h2>
              <p className="text-sm text-muted-foreground">Էլեկտրոնային ՀԴՄ (ՊԵԿ)</p>
            </div>
            <Link href={"/sales/hdm" as Route} className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">
              ← Կտրոններ
            </Link>
          </div>

          {MODE_NOTICE[mode] && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">⚠ {MODE_NOTICE[mode]}</p>}

          <div className={`${cardClass} space-y-3`}>
            <h3 className="font-semibold text-foreground">Ապրանքներ</h3>
            <div className="hidden gap-2 text-xs font-semibold text-muted-foreground lg:grid lg:grid-cols-[1fr_7rem_7rem_5rem_5rem_7rem_4.5rem_7rem_2rem]">
              <span>Անվանում</span>
              <span>Կոդ</span>
              <span>ԱՏԳ կոդ</span>
              <span>Միավոր</span>
              <span>Քանակ</span>
              <span>Գին</span>
              <span>Զեղչ %</span>
              <span className="text-right">Գումար</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 lg:grid-cols-[1fr_7rem_7rem_5rem_5rem_7rem_4.5rem_7rem_2rem] lg:items-center lg:border-0 lg:p-0"
              >
                <input value={r.goodName} onChange={(e) => updateRow(i, { goodName: e.target.value.slice(0, 50) })} placeholder="Անվանում" className={`${inputClass} col-span-2 lg:col-span-1`} aria-label="Անվանում" />
                <input value={r.goodCode} onChange={(e) => updateRow(i, { goodCode: e.target.value.slice(0, 50) })} placeholder="Կոդ (ոչ պարտ.)" className={inputClass} aria-label="Ապրանքի կոդ" />
                <input value={r.adgCode} onChange={(e) => updateRow(i, { adgCode: e.target.value.replace(/[^\d.]/g, "") })} placeholder="ԱՏԳ կոդ" inputMode="numeric" className={inputClass} aria-label="ԱՏԳ կոդ" />
                <input value={r.unit} onChange={(e) => updateRow(i, { unit: e.target.value.slice(0, 50) })} placeholder="Միավոր" className={inputClass} aria-label="Միավոր" />
                <input
                  value={r.quantity}
                  onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  disabled={r.emarks.length > 0}
                  title={r.emarks.length > 0 ? "Քանակը EMark կոդերի թիվն է" : undefined}
                  placeholder="Քանակ"
                  inputMode="decimal"
                  className={`${inputClass} disabled:bg-muted`}
                  aria-label="Քանակ"
                />
                <input value={r.price} onChange={(e) => updateRow(i, { price: e.target.value })} placeholder="Գին" inputMode="decimal" className={inputClass} aria-label="Գին" />
                <input value={r.discount} onChange={(e) => updateRow(i, { discount: e.target.value })} placeholder="Զեղչ %" inputMode="decimal" className={inputClass} aria-label="Զեղչ %" />
                <span className="self-center text-right text-sm font-semibold tabular-nums">
                  <span className="mr-1 font-normal text-muted-foreground lg:hidden">Գումար՝</span>
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
                <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-9">
                  <button
                    type="button"
                    onClick={() => setScanning(i)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent ${
                      r.emarks.length > 0 ? "border-green-600 text-green-800" : "border-input"
                    }`}
                  >
                    📷 {r.emarks.length > 0 ? `EMark · ${r.emarks.length}` : "Ավելացնել EMark"}
                  </button>
                  {r.emarks.slice(-2).map((code) => (
                    <span key={code} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" title={code}>
                      {showEmark(code)}
                    </span>
                  ))}
                  {r.emarks.length > 2 && <span className="text-xs text-muted-foreground">+{r.emarks.length - 2}</span>}
                </div>
              </div>
            ))}
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
            <h3 className="font-semibold text-foreground">Վճարում</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["cash", "Կանխիկ"],
                  ["card", "Անկանխիկ"],
                  ["mixed", "Խառը"],
                ] as [Payment, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input type="radio" checked={payment === key} onChange={() => setPayment(key)} /> {label}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {payment === "mixed" && (
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Անկանխիկ</span>
                  <input value={cardPart} onChange={(e) => setCardPart(e.target.value)} inputMode="decimal" className={inputClass} />
                </label>
              )}
              {payment !== "card" && (
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Ստացված կանխիկ</span>
                  <input value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder={formatAmount(Math.max(0, round2(total - card)))} inputMode="decimal" className={inputClass} />
                </label>
              )}
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Գնորդի ՀՎՀՀ (ոչ պարտադիր)</span>
                <input value={partnerTin} onChange={(e) => setPartnerTin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" className={inputClass} />
              </label>
            </div>
            {change > 0 && (
              <p className="text-sm">
                Մանր՝ <b className="tabular-nums">{formatAmount(change)}</b>
              </p>
            )}
          </div>

          <div className={`${cardClass} space-y-3`}>
            {problems.length > 0 && <p className="text-sm text-muted-foreground">Լրացրեք՝ {problems.join(", ")}</p>}
            <button
              type="button"
              onClick={send}
              disabled={problems.length > 0 || sending || mode === "off"}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? "Տպվում է…" : "🧾 Տպել կտրոն"}
            </button>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">✕ {error}</p>}
          </div>
        </div>
      </main>
      {scanning !== null && rows[scanning] && (
        <EmarkScanner
          title={rows[scanning].goodName || `տող ${scanning + 1}`}
          codes={rows[scanning].emarks}
          taken={takenElsewhere(scanning)}
          onChange={(codes) => setEmarks(scanning, codes)}
          onClose={() => setScanning(null)}
        />
      )}
    </div>
  );
}

export default function HdmFormClient() {
  return (
    <AuthGuard section="sales">
      <HdmFormView />
    </AuthGuard>
  );
}
