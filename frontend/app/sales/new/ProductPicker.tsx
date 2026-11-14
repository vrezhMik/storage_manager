"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatAmount } from "../../reports/sales/salesData";
import { Catalog, CatalogItem, loadCatalog, loadStock, StockInfo } from "../catalog";

// Full-screen product list for a sale: tap a product to type its quantity, or
// press and hold it and slide right (more) or left (less).

export type PickedLine = { item: CatalogItem; quantity: number; info: StockInfo | null };

const PAGE = 60; // products drawn at a time
const STOCK_BATCH = 50; // codes per stock request to 1C
const HOLD_MS = 350; // press this long before sliding changes the quantity
const STEP_PX = 28; // slide this far for each unit
const MOVE_PX = 8; // moving more before the hold means scrolling

const num = (s: string) => {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const buzz = (ms: number) => navigator.vibrate?.(ms);

type Gesture = { code: string; x: number; y: number; start: number; held: boolean; moved: boolean; timer: number };

export default function ProductPicker({ onClose, onAdd }: { onClose: () => void; onAdd: (lines: PickedLine[]) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [stock, setStock] = useState<Record<string, StockInfo>>({});
  const [stockError, setStockError] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [draft, setDraft] = useState("");
  const [sliding, setSliding] = useState<string | null>(null);
  const asked = useRef(new Set<string>());
  const gesture = useRef<Gesture | null>(null);

  const open = (refresh: boolean) => {
    setError(null);
    setRefreshing(refresh);
    loadCatalog(refresh)
      .then(setCatalog)
      .catch((err) =>
        setError(
          /No catalog site/.test(String(err?.message))
            ? "Ապրանքացանկի կայքը կարգավորված չէ (ադմինկա → DB Config → Catalog site)։"
            : "Չհաջողվեց ստանալ ապրանքացանկը",
        ),
      )
      .finally(() => setRefreshing(false));
  };
  useEffect(() => open(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (editing ? setEditing(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  const byCode = useMemo(() => new Map((catalog?.items ?? []).map((i) => [i.code || i.name, i])), [catalog]);
  const groups = useMemo(() => {
    const used = new Set((catalog?.items ?? []).flatMap((i) => i.groups));
    return (catalog?.groups ?? []).filter((g) => used.has(g.id));
  }, [catalog]);

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (catalog?.items ?? []).filter(
      (i) =>
        (group === null || i.groups.includes(group)) &&
        words.every((w) => i.name.toLowerCase().includes(w) || i.code.toLowerCase().includes(w)),
    );
  }, [catalog, search, group]);
  const visible = shown.slice(0, limit);

  useEffect(() => setLimit(PAGE), [search, group]);

  // Stock only for the drawn products whose stock was not asked yet.
  const visibleCodes = visible.map((i) => i.code).filter(Boolean).join("\n");
  useEffect(() => {
    const codes = visibleCodes.split("\n").filter((c) => c && !asked.current.has(c));
    if (codes.length === 0) return;
    const timer = window.setTimeout(() => {
      for (let i = 0; i < codes.length; i += STOCK_BATCH) {
        const batch = codes.slice(i, i + STOCK_BATCH);
        batch.forEach((c) => asked.current.add(c));
        loadStock(batch)
          .then((found) => setStock((prev) => ({ ...prev, ...found })))
          .catch(() => {
            batch.forEach((c) => asked.current.delete(c));
            setStockError(true);
          });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [visibleCodes]);

  const setItemQty = (key: string, value: number) =>
    setQty((prev) => {
      const next = { ...prev };
      if (value > 0) next[key] = value;
      else delete next[key];
      return next;
    });

  const keyOf = (i: CatalogItem) => i.code || i.name;

  const onDown = (e: ReactPointerEvent, item: CatalogItem) => {
    if (e.button !== 0) return;
    const key = keyOf(item);
    const g: Gesture = { code: key, x: e.clientX, y: e.clientY, start: qty[key] ?? 0, held: false, moved: false, timer: 0 };
    g.timer = window.setTimeout(() => {
      g.held = true;
      setSliding(key);
      buzz(15);
    }, HOLD_MS);
    gesture.current = g;
  };
  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    if (!g.held) {
      if (Math.abs(dx) > MOVE_PX || Math.abs(e.clientY - g.y) > MOVE_PX) {
        g.moved = true;
        window.clearTimeout(g.timer);
      }
      return;
    }
    const next = Math.max(0, Math.floor(g.start) + Math.round(dx / STEP_PX));
    setQty((prev) => {
      if ((prev[g.code] ?? 0) === next) return prev;
      buzz(5);
      const copy = { ...prev };
      if (next > 0) copy[g.code] = next;
      else delete copy[g.code];
      return copy;
    });
  };
  const onUp = (item: CatalogItem) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    window.clearTimeout(g.timer);
    if (g.held) {
      setSliding(null);
    } else if (!g.moved) {
      setEditing(item);
      setDraft(qty[keyOf(item)] ? String(qty[keyOf(item)]) : "");
    }
  };
  const onCancel = () => {
    if (gesture.current) window.clearTimeout(gesture.current.timer);
    gesture.current = null;
    setSliding(null);
  };

  const picked = Object.entries(qty)
    .map(([key, quantity]) => ({ item: byCode.get(key), quantity }))
    .filter((p): p is { item: CatalogItem; quantity: number } => Boolean(p.item));
  const pickedTotal = picked.reduce((s, p) => s + (p.item.price ?? 0) * p.quantity, 0);
  const slidingItem = sliding ? byCode.get(sliding) : null;

  const saveDraft = () => {
    if (editing) setItemQty(keyOf(editing), num(draft));
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-lg font-semibold text-foreground">Ապրանքացանկ</h3>
          <button
            type="button"
            onClick={() => open(true)}
            disabled={refreshing}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            title="Կարդալ կայքից նորից"
          >
            {refreshing ? "…" : "⟳"}
          </button>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-lg hover:bg-accent" aria-label="Փակել">
            ✕
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Որոնում՝ անվանում կամ կոդ"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          aria-label="Որոնում"
        />
        {groups.length > 0 && (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {[{ id: null as number | null, name: "Բոլորը" }, ...groups].map((g) => (
              <button
                key={g.id ?? "all"}
                type="button"
                onClick={() => setGroup(g.id)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                  group === g.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Սեղմեք՝ քանակ գրելու համար, կամ սեղմած պահեք և տարեք աջ (+) կամ ձախ (−)։
          {stockError && " Մնացորդը մի մասի համար չստացվեց։"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="p-4 text-sm text-red-600">{error}</p>}
        {!catalog && !error && <p className="p-4 text-sm text-muted-foreground">Բեռնվում է…</p>}
        {catalog && shown.length === 0 && <p className="p-4 text-sm text-muted-foreground">Ապրանք չգտնվեց</p>}
        <ul className="divide-y">
          {visible.map((item) => {
            const key = keyOf(item);
            const q = qty[key] ?? 0;
            const info = item.code ? stock[item.code] : undefined;
            const short = info?.stock != null && q > info.stock;
            return (
              <li
                key={key}
                onPointerDown={(e) => onDown(e, item)}
                onPointerMove={onMove}
                onPointerUp={() => onUp(item)}
                onPointerCancel={onCancel}
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: "pan-y", WebkitTouchCallout: "none" }}
                className={`flex cursor-pointer select-none items-center gap-3 px-3 py-2 ${
                  sliding === key ? "bg-primary/10" : q > 0 ? "bg-green-50" : ""
                }`}
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" loading="lazy" draggable={false} className="h-14 w-14 shrink-0 rounded-md bg-muted object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.price != null ? `${formatAmount(item.price)} ֏` : "գին չկա"}
                    {" · "}
                    {!item.code ? (
                      <span className="text-amber-700">կոդ չկա</span>
                    ) : info ? (
                      <span className={short ? "font-semibold text-red-600" : ""}>
                        մնացորդ՝ {info.stock ?? "—"} {info.unit ?? ""}
                      </span>
                    ) : (
                      "մնացորդ՝ …"
                    )}
                  </p>
                </div>
                {q > 0 && (
                  <span className={`min-w-[2.5rem] rounded-full px-2 py-1 text-center text-sm font-bold tabular-nums ${short ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"}`}>
                    {formatAmount(q)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full py-4 text-sm font-medium text-primary hover:underline">
            Ցույց տալ ևս ({shown.length - limit})
          </button>
        )}
      </div>

      {slidingItem && (
        <div className="pointer-events-none fixed left-1/2 top-1/3 z-[70] -translate-x-1/2 rounded-2xl bg-black/80 px-6 py-4 text-center text-white">
          <p className="max-w-[16rem] truncate text-xs opacity-80">{slidingItem.name}</p>
          <p className="text-4xl font-bold tabular-nums">{formatAmount(qty[keyOf(slidingItem)] ?? 0)}</p>
        </div>
      )}

      <div className="flex items-center gap-3 border-t p-3">
        <div className="flex-1 text-sm">
          <p>Ընտրված՝ <b>{picked.length}</b> ապրանք</p>
          <p className="text-muted-foreground">Գումար՝ <b className="tabular-nums text-foreground">{formatAmount(pickedTotal)}</b></p>
        </div>
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => onAdd(picked.map((p) => ({ ...p, info: p.item.code ? stock[p.item.code] ?? null : null })))}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          Ավելացնել
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-t-2xl bg-background p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-foreground">{editing.name}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDraft(String(Math.max(0, num(draft) - 1)))} className="h-12 w-12 rounded-md border text-xl">
                −
              </button>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveDraft()}
                inputMode="decimal"
                placeholder="Քանակ"
                className="h-12 flex-1 rounded-md border border-input bg-transparent px-3 text-center text-xl tabular-nums"
                aria-label="Քանակ"
              />
              <button type="button" onClick={() => setDraft(String(num(draft) + 1))} className="h-12 w-12 rounded-md border text-xl">
                +
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setItemQty(keyOf(editing), 0); setEditing(null); }} className="flex-1 rounded-md border px-4 py-2 text-sm">
                Հանել
              </button>
              <button type="button" onClick={saveDraft} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Պատրաստ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
