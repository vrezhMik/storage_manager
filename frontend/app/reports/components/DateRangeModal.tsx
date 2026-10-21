"use client";

import { useEffect, useState } from "react";

export type DateRange = { start: string; end: string };

// Dates are kept as YYYY-MM-DD (the <input type="date"> value format).
const toInputDate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const defaultDateRange = (): DateRange => {
  const today = new Date();
  return {
    start: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: toInputDate(today),
  };
};

export const formatDisplayDate = (value: string) => {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}.${m}.${y}` : value;
};

type Props = {
  open: boolean;
  title: string;
  initial?: DateRange;
  onClose: () => void;
  onSubmit: (range: DateRange) => void;
};

export default function DateRangeModal({ open, title, initial, onClose, onSubmit }: Props) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const range = initial ?? defaultDateRange();
    setStart(range.start);
    setEnd(range.end);
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) {
      setError("Նշեք երկու ամսաթվերը");
      return;
    }
    if (start > end) {
      setError("Սկիզբը չի կարող լինել վերջից հետո");
      return;
    }
    onSubmit({ start, end });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="date-range-title"
        className="w-full max-w-sm rounded-xl border bg-card text-card-foreground shadow-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="date-range-title" className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Սկիզբ</span>
            <input
              type="date"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={start}
              max={end || undefined}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted-foreground">Վերջ</span>
            <input
              type="date"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </label>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 h-10 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            Չեղարկել
          </button>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md px-4 py-2 h-10 text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90"
          >
            Ցուցադրել
          </button>
        </div>
      </form>
    </div>
  );
}
