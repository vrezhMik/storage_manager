"use client";

import { useState } from "react";

// "⬇ Excel" button for reports; onExport builds and downloads the file.
export default function ExcelButton({ onExport }: { onExport: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        try {
          await onExport();
        } catch (err) {
          console.error("Excel export failed", err);
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-accent disabled:opacity-50"
      title="Պահպանել Excel ֆայլով"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      {busy ? "..." : failed ? "Սխալ, կրկնել" : "Excel"}
    </button>
  );
}
