"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import { formatAmount } from "../../reports/sales/salesData";
import { cardClass } from "../salesShared";
import SalesTabs from "../SalesTabs";
import { deleteOrder, errorMessage, loadOrders, SalesOrder, sendOrder, STATUS_LABELS } from "../salesOrders";

// "Պատվերներ": the user's sales kept in the terminal and the ones sent to 1C.

const STATUS_CLASS = {
  DRAFT: "bg-gray-100 text-gray-700",
  FAILED: "bg-red-100 text-red-800",
  SENT: "bg-green-100 text-green-800",
} as const;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "");

function OrdersView() {
  const saved = useSearchParams().get("saved") === "1";
  const [orders, setOrders] = useState<SalesOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const reload = () =>
    loadOrders()
      .then(setOrders)
      .catch(() => setError("Չհաջողվեց ստանալ պատվերները"));
  useEffect(() => {
    reload();
  }, []);

  const replace = (o: SalesOrder) => setOrders((prev) => (prev ?? []).map((x) => (x.id === o.id ? o : x)));

  const send = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      replace(await sendOrder(id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Ջնջե՞լ այս սևագիրը։")) return;
    setBusy(id);
    try {
      await deleteOrder(id);
      setOrders((prev) => (prev ?? []).filter((x) => x.id !== id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="App">
      <main className="container mx-auto space-y-4 px-4 py-6 pb-20">
        <SalesTabs active="orders" />
        <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
          <h2 className="text-xl font-semibold">Պատվերներ</h2>
          <Link
            href={"/sales/new" as Route}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            + Նոր վաճառք
          </Link>
        </div>
        {saved && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">✓ Պահպանված է</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {!orders && !error && <p className="text-sm text-muted-foreground">Բեռնվում է…</p>}
        {orders && orders.length === 0 && <p className="text-sm text-muted-foreground">Դեռ վաճառք չկա</p>}
        <div className="space-y-2">
          {(orders ?? []).map((o) => (
            <div key={o.id} className={`${cardClass} space-y-2 !p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{o.buyerName}</p>
                  <p className="text-xs text-muted-foreground">
                    №{o.id} · {when(o.createdAt)}
                    {o.buyerTin && ` · ՀՎՀՀ ${o.buyerTin}`} · {o.items.length} ապրանք
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatAmount(o.total)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[o.status]}`}>
                    {STATUS_LABELS[o.status]}
                    {o.onecNumber && ` · ${o.onecNumber}`}
                  </span>
                </div>
              </div>
              {o.status === "FAILED" && o.error && <p className="text-xs text-red-700">{o.error}</p>}
              {o.status !== "SENT" && (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/sales/new/?order=${o.id}` as Route} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">
                    Բացել
                  </Link>
                  <button
                    type="button"
                    onClick={() => send(o.id)}
                    disabled={busy === o.id}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {busy === o.id ? "Ուղարկվում է…" : "📤 Ուղարկել 1C"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(o.id)}
                    disabled={busy === o.id}
                    className="ml-auto rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Ջնջել
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function OrdersListClient() {
  return (
    <AuthGuard section="sales">
      <OrdersView />
    </AuthGuard>
  );
}
