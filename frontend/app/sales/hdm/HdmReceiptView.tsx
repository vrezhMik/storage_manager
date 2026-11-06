"use client";

import { useEffect, useMemo } from "react";
import qrcode from "qrcode-generator";
import { formatAmount } from "../../reports/sales/salesData";
import { HdmReceipt } from "./hdmShared";

// The receipt as printed: 72 mm wide, with the tax service's QR code.

const qrSvg = (text: string) => {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
};

const dateTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const Line = ({ label, value, bold }: { label: string; value: string | number | null | undefined; bold?: boolean }) =>
  value === null || value === undefined || value === "" ? null : (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );

export default function HdmReceiptView({ receipt }: { receipt: HdmReceipt }) {
  const svg = useMemo(() => (receipt.qr ? qrSvg(receipt.qr) : null), [receipt.qr]);
  const isReturn = receipt.type === "RETURN";
  const fake = receipt.mode === "mock" || receipt.mode === "test";

  return (
    <div className="hdm-receipt mx-auto w-[72mm] bg-white p-2 font-mono text-[11px] leading-snug text-black">
      {fake && <p className="mb-1 border border-black py-0.5 text-center font-bold">ՓՈՐՁԱՐԿՈՒՄ · ԻՐԱԿԱՆ ԿՏՐՈՆ ՉԷ</p>}
      <p className="text-center font-bold">{receipt.taxpayer}</p>
      {receipt.address && <p className="text-center">{receipt.address}</p>}
      <div className="my-1 border-t border-dashed border-black" />
      <Line label="ՀՎՀՀ" value={receipt.tin} />
      <Line label="ՀԴՄ ԳՀ" value={receipt.crn} />
      <Line label="ՀԴՄ ՍՀ" value={receipt.sn} />
      <Line label="Կտրոն N" value={receipt.receiptId} />
      <Line label="ՖԻՍԿԱԼ" value={receipt.fiscal} />
      <Line label="Ամսաթիվ" value={dateTime(receipt.printedAt)} />
      {receipt.partnerTin && <Line label="Գնորդի ՀՎՀՀ" value={receipt.partnerTin} />}
      {isReturn && <p className="mt-1 text-center font-bold">ՎԵՐԱԴԱՐՁ · կտրոն N {receipt.returnOfReceiptId}</p>}
      {receipt.copy && <p className="mt-1 text-center font-bold">ԿՐԿՆՕՐԻՆԱԿ</p>}
      <div className="my-1 border-t border-dashed border-black" />
      {(receipt.items ?? []).map((item, i) => {
        const line = item.price !== undefined ? item.price * item.quantity : null;
        return (
          <div key={i} className="mb-1">
            <p className="break-words">{item.goodName}</p>
            {item.price !== undefined ? (
              <div className="flex justify-between gap-2">
                <span>
                  {item.quantity} {item.unit} × {formatAmount(item.price)}
                  {item.discount ? ` −${item.discount}%` : ""}
                </span>
                <span className="tabular-nums">{formatAmount(line && item.discount ? line * (1 - item.discount / 100) : line ?? 0)}</span>
              </div>
            ) : (
              <p>{item.quantity}</p>
            )}
          </div>
        );
      })}
      <div className="my-1 border-t border-dashed border-black" />
      <Line label={isReturn ? "ՎԵՐԱԴԱՐՁ" : "ԸՆԴԱՄԵՆԸ"} value={formatAmount(receipt.total)} bold />
      <Line label="Կանխիկ" value={receipt.cash ? formatAmount(receipt.cash) : null} />
      <Line label="Անկանխիկ" value={receipt.card ? formatAmount(receipt.card) : null} />
      <Line label="Մանր" value={receipt.change ? formatAmount(receipt.change) : null} />
      {svg && <div className="mx-auto mt-2 w-[36mm]" dangerouslySetInnerHTML={{ __html: svg }} />}
      {receipt.user && <p className="mt-1 text-center">Գանձապահ՝ {receipt.user}</p>}
    </div>
  );
}

/**
 * Prints only the receipt (see .hdm-printing in globals.css).
 */
export const printReceipt = () => {
  document.body.classList.add("hdm-printing");
  const done = () => {
    document.body.classList.remove("hdm-printing");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  window.setTimeout(done, 1000);
};

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
