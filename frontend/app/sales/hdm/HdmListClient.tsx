"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import { API_BASE, authFetch } from "../../lib/auth";
import { formatAmount } from "../../reports/sales/salesData";
import { cardClass } from "../salesShared";
import SalesTabs from "../SalesTabs";
import { showEmark } from "./EmarkScanner";
import HdmReceiptView, { printReceipt, useEscape } from "./HdmReceiptView";
import { hdmError, HdmMode, HdmReceipt, MODE_NOTICE, num, round2 } from "./hdmShared";

const inputClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-4 text-card-foreground shadow-lg" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ReceiptModal({ receipt, onClose, onReturn }: { receipt: HdmReceipt; onClose: () => void; onReturn?: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border bg-white">
        <HdmReceiptView receipt={receipt} />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {onReturn && (
          <button type="button" onClick={onReturn} className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">
            ↩ Վերադարձ
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">
          Փակել
        </button>
        <button type="button" onClick={printReceipt} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          🖨 Տպել
        </button>
      </div>
    </Modal>
  );
}

// A row sold with eMark codes is returned by ticking the codes given back.
type ReturnRow = {
  receiptProductId: number;
  goodName: string;
  unit: string;
  price: number;
  left: number;
  unitValue: number;
  quantity: string;
  emarks: string[];
  picked: string[];
};

function ReturnModal({ receipt, onClose, onDone }: { receipt: HdmReceipt; onClose: () => void; onDone: (r: HdmReceipt) => void }) {
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [paidByCard, setPaidByCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authFetch<{ cash: number; card: number; items: { receiptProductId: number; goodName: string; unit: string; price: number; quantity: number; total: number; emarks?: string[] }[] }>(
      `${API_BASE}/sales/ehdm/receipts/${receipt.id}/return-info`,
    )
      .then((info) => {
        setPaidByCard((info?.card ?? 0) > 0 && (info?.cash ?? 0) === 0);
        const original = receipt.items ?? [];
        setRows(
          (info?.items ?? []).map((row) => {
            // The value of one unit as sold (after its % discount).
            const sold = original[row.receiptProductId];
            const unitValue = (sold?.price ?? row.price) * (1 - (sold?.discount ?? 0) / 100);
            return {
              receiptProductId: row.receiptProductId,
              goodName: row.goodName,
              unit: row.unit,
              price: row.price,
              left: row.quantity,
              unitValue,
              quantity: "",
              emarks: row.emarks ?? [],
              picked: [],
            };
          }),
        );
      })
      .catch((err) => setError(hdmError(err)));
  }, [receipt]);

  const chosen = (rows ?? []).filter((r) => num(r.quantity) > 0);
  const amount = round2(chosen.reduce((s, r) => s + r.unitValue * num(r.quantity), 0));
  const tooMuch = chosen.some((r) => num(r.quantity) > r.left + 1e-9);

  const send = async () => {
    if (busy || chosen.length === 0 || tooMuch) return;
    if (!window.confirm(`Տպե՞լ վերադարձի կտրոն ${formatAmount(amount)} դրամով։`)) return;
    setBusy(true);
    setError(null);
    try {
      const done = await authFetch<HdmReceipt>(`${API_BASE}/sales/ehdm/receipts/${receipt.id}/return`, {
        method: "POST",
        body: JSON.stringify({
          cashAmount: paidByCard ? 0 : amount,
          cardAmount: paidByCard ? amount : 0,
          items: chosen.map((r) => ({
            receiptProductId: r.receiptProductId,
            quantity: num(r.quantity),
            goodName: r.goodName,
            ...(r.emarks.length > 0 ? { emarks: r.picked } : {}),
          })),
        }),
      });
      onDone(done);
    } catch (err) {
      setError(hdmError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="mb-2 font-semibold">Վերադարձ · կտրոն N {receipt.receiptId}</h3>
      {rows === null && !error && <p className="text-sm text-muted-foreground">Բեռնվում է…</p>}
      {rows && (
        <div className="space-y-2 text-sm">
          {rows.map((r, i) => (
            <div key={r.receiptProductId} className="grid grid-cols-[1fr_6rem] items-center gap-2">
              <span className="min-w-0">
                <span className="block break-words">{r.goodName}</span>
                <span className="block text-xs text-muted-foreground">
                  Մնացել է՝ {r.left} {r.unit} · {formatAmount(r.unitValue)}
                </span>
              </span>
              <input
                value={r.quantity}
                disabled={r.left <= 0 || r.emarks.length > 0}
                onChange={(e) => setRows((prev) => prev!.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                placeholder="0"
                inputMode="decimal"
                className={`${inputClass} disabled:bg-muted`}
                aria-label={`Վերադարձվող քանակ՝ ${r.goodName}`}
              />
              {r.emarks.length > 0 && (
                <div className="col-span-2 space-y-1 rounded-md bg-muted/50 p-2">
                  <p className="text-xs text-muted-foreground">Նշեք վերադարձվող EMark կոդերը</p>
                  {r.emarks.map((code) => (
                    <label key={code} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={r.picked.includes(code)}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev!.map((x, j) => {
                              if (j !== i) return x;
                              const picked = e.target.checked ? [...x.picked, code] : x.picked.filter((c) => c !== code);
                              return { ...x, picked, quantity: picked.length ? String(picked.length) : "" };
                            }),
                          )
                        }
                      />
                      <span className="truncate font-mono" title={code}>
                        {showEmark(code, 40)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-4 border-t pt-2">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!paidByCard} onChange={() => setPaidByCard(false)} /> Կանխիկ
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={paidByCard} onChange={() => setPaidByCard(true)} /> Անկանխիկ
            </label>
            <span className="ml-auto">
              Վերադարձ՝ <b className="tabular-nums">{formatAmount(amount)}</b>
            </span>
          </div>
          {tooMuch && <p className="text-red-600">Քանակը գերազանցում է մնացածը։</p>}
        </div>
      )}
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">✕ {error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">
          Չեղարկել
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy || chosen.length === 0 || tooMuch}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Տպվում է…" : "↩ Տպել վերադարձ"}
        </button>
      </div>
    </Modal>
  );
}

export function HdmListView() {
  const params = useSearchParams();
  const router = useRouter();
  const [receipts, setReceipts] = useState<HdmReceipt[] | null>(null);
  const [mode, setMode] = useState<HdmMode>("off");
  const [ready, setReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<HdmReceipt | null>(null);
  const [returning, setReturning] = useState<HdmReceipt | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    authFetch<{ mode: HdmMode; ready: boolean; receipts: HdmReceipt[] }>(`${API_BASE}/sales/ehdm`)
      .then((res) => {
        setReceipts(res?.receipts ?? []);
        setMode(res?.mode ?? "off");
        setReady(res?.ready ?? false);
        setError(null);
      })
      .catch((err) => setError(hdmError(err)));
  }, []);
  useEffect(load, [load]);

  const show = useCallback(async (id: number) => {
    setBusyId(id);
    try {
      setOpen(await authFetch<HdmReceipt>(`${API_BASE}/sales/ehdm/receipts/${id}`));
    } catch (err) {
      setError(hdmError(err));
    } finally {
      setBusyId(null);
    }
  }, []);

  // Coming from the form: show the receipt that was just printed.
  const justPrinted = params.get("receipt");
  useEffect(() => {
    if (justPrinted) {
      show(Number(justPrinted));
      router.replace("/sales/hdm" as Route);
    }
  }, [justPrinted, show, router]);

  const startReturn = async (r: HdmReceipt) => {
    const full = r.items ? r : await authFetch<HdmReceipt>(`${API_BASE}/sales/ehdm/receipts/${r.id}`).catch(() => null);
    setOpen(null);
    if (full) setReturning(full);
  };

  const canReturn = (r: HdmReceipt) => r.type === "SALE" && r.status === "OK" && r.returnedTotal < r.total;

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <SalesTabs active="hdm" />
          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="text-xl font-semibold text-foreground">ՀԴՄ կտրոններ</h2>
              <p className="text-sm text-muted-foreground">Էլեկտրոնային ՀԴՄ (ՊԵԿ)</p>
            </div>
            {ready && (
              <Link
                href={"/sales/hdm/new" as Route}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                ＋ Նոր կտրոն
              </Link>
            )}
          </div>

          {MODE_NOTICE[mode] && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">⚠ {MODE_NOTICE[mode]}</p>}
          {!ready && receipts !== null && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              e-ՀԴՄ-ն կարգավորված չէ։ Ադմինկայում (DB entries) ընտրեք e-ՀԴՄ ռեժիմը։
            </p>
          )}

          <div className={`${cardClass} space-y-2`}>
            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : receipts === null ? (
              <div className="space-y-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            ) : receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Դեռ կտրոններ չկան։</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {receipts.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {r.type === "RETURN" ? "↩ Վերադարձ" : "Կտրոն"}
                        {r.receiptId ? ` N ${r.receiptId}` : ""}
                        {r.fiscal ? ` · ՖՀ ${r.fiscal}` : ""}
                        {r.mode !== "live" && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-xs text-amber-900">{r.mode}</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {when(r.printedAt)}
                        {r.partnerTin ? ` · ՀՎՀՀ ${r.partnerTin}` : ""}
                        {r.user ? ` · ${r.user}` : ""}
                        {r.returnedTotal > 0 ? ` · վերադարձված՝ ${formatAmount(r.returnedTotal)}` : ""}
                      </span>
                      {r.status === "FAILED" && r.error && <span className="block text-xs break-words text-red-700">{hdmError(r.error)}</span>}
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <span className={`font-semibold tabular-nums ${r.type === "RETURN" ? "text-red-700" : ""}`}>
                        {r.type === "RETURN" ? "−" : ""}
                        {formatAmount(r.total)}
                      </span>
                      {r.status === "FAILED" ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Սխալ</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => show(r.id)}
                            disabled={busyId !== null}
                            className="rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            {busyId === r.id ? "…" : "🧾 Դիտել"}
                          </button>
                          {canReturn(r) && (
                            <button
                              type="button"
                              onClick={() => startReturn(r)}
                              className="rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-accent"
                            >
                              ↩ Վերադարձ
                            </button>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      {open && <ReceiptModal receipt={open} onClose={() => setOpen(null)} onReturn={canReturn(open) ? () => startReturn(open) : undefined} />}
      {returning && (
        <ReturnModal
          receipt={returning}
          onClose={() => setReturning(null)}
          onDone={(done) => {
            setReturning(null);
            setOpen(done);
            load();
          }}
        />
      )}
    </div>
  );
}

export default function HdmListClient() {
  return (
    <AuthGuard section="sales">
      <HdmListView />
    </AuthGuard>
  );
}
