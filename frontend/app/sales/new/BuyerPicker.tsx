"use client";

import { useEffect, useMemo, useState } from "react";
import { loadPartners, Partner } from "../catalog";

// Full-screen list of the company's partners from 1C; a new buyer is found in
// the tax service by TIN, as in the form.

const PAGE = 100;

export default function BuyerPicker({
  onClose,
  onPick,
  onFind,
  finding,
  findError,
}: {
  onClose: () => void;
  onPick: (partner: Partner) => void;
  onFind: (tin: string) => void;
  finding: boolean;
  findError: string | null;
}) {
  const [list, setList] = useState<Partner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [newTin, setNewTin] = useState<string | null>(null);

  useEffect(() => {
    loadPartners()
      .then(setList)
      .catch((err) =>
        setError(
          /No partners endpoint/.test(String(err?.message))
            ? "Գործընկերների ցանկը կարգավորված չէ (ադմինկա → DB Config → API: Partners)։ Կարող եք ավելացնել նորը ՀՎՀՀ-ով։"
            : "Չհաջողվեց ստանալ գործընկերների ցանկը։ Կարող եք ավելացնել նորը ՀՎՀՀ-ով։",
        ),
      );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return (list ?? []).filter((p) => words.every((w) => `${p.name} ${p.tin} ${p.address}`.toLowerCase().includes(w)));
  }, [list, search]);

  useEffect(() => setLimit(PAGE), [search]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-card">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-lg font-semibold">Գործընկերներ</h3>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-lg hover:bg-accent" aria-label="Փակել">
            ✕
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Որոնում՝ անվանում, ՀՎՀՀ կամ հասցե"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          aria-label="Որոնում"
        />
        {newTin === null ? (
          <button type="button" onClick={() => setNewTin("")} className="text-sm font-medium text-primary hover:underline">
            + Նոր գործընկեր (ՀՎՀՀ-ով)
          </button>
        ) : (
          <div className="space-y-1">
            <div className="flex gap-2">
              <input
                autoFocus
                value={newTin}
                onChange={(e) => setNewTin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => e.key === "Enter" && onFind(newTin)}
                inputMode="numeric"
                placeholder="ՀՎՀՀ (8 թիվ)"
                className="w-40 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                aria-label="Նոր գործընկերոջ ՀՎՀՀ"
              />
              <button
                type="button"
                onClick={() => onFind(newTin)}
                disabled={finding || newTin.length !== 8}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {finding ? "Որոնում…" : "Գտնել ՊԵԿ-ում"}
              </button>
            </div>
            {findError && <p className="text-sm text-red-600">{findError}</p>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="p-4 text-sm text-red-600">{error}</p>}
        {!list && !error && <p className="p-4 text-sm text-muted-foreground">Բեռնվում է…</p>}
        {list && shown.length === 0 && <p className="p-4 text-sm text-muted-foreground">Գործընկեր չգտնվեց</p>}
        <ul className="divide-y">
          {shown.slice(0, limit).map((p, i) => (
            <li key={`${p.tin}-${i}`}>
              <button type="button" onClick={() => onPick(p)} className="w-full px-3 py-2 text-left hover:bg-accent">
                <p className="text-sm font-medium">{p.name || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {p.tin ? `ՀՎՀՀ ${p.tin}` : <span className="text-amber-700">ՀՎՀՀ չկա</span>}
                  {p.address && ` · ${p.address}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full py-4 text-sm font-medium text-primary hover:underline">
            Ցույց տալ ևս ({shown.length - limit})
          </button>
        )}
      </div>
    </div>
  );
}
