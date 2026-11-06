"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useEscape } from "./HdmReceiptView";

// Scans eMark codes (դրոշմավորման QR / DataMatrix) with the camera, one per
// unit. Codes keep their hidden GS separators (\u001d), which keyboard-like
// USB scanners often lose.

export const EMARK_MIN = 29;
export const EMARK_MAX = 128;

const codeLength = (code: string) => Array.from(code).length;
export const isEmark = (code: string) => codeLength(code) >= EMARK_MIN && codeLength(code) <= EMARK_MAX;

// The code as shown: separators visible, the middle shortened.
export const showEmark = (code: string, max = 28) => {
  const text = code.replace(/\u001d/g, "␝");
  return text.length > max ? `${text.slice(0, max - 9)}…${text.slice(-8)}` : text;
};

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> };

type Props = {
  title: string;
  codes: string[];
  // Codes already on other rows of the receipt.
  taken: Set<string>;
  onChange: (codes: string[]) => void;
  onClose: () => void;
};

export default function EmarkScanner({ title, codes, taken, onChange, onClose }: Props) {
  useEscape(onClose);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codesRef = useRef(codes);
  codesRef.current = codes;
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const add = (raw: string) => {
    const code = raw.replace(/\r|\n/g, "");
    const now = Date.now();
    // The camera sees the same code many times a second.
    if (lastRef.current?.code === code && now - lastRef.current.at < 2500) return;
    lastRef.current = { code, at: now };

    if (!isEmark(code)) {
      setMessage({ ok: false, text: `Սա eMark կոդ չէ (${codeLength(code)} նիշ, պետք է ${EMARK_MIN}–${EMARK_MAX})` });
      return;
    }
    if (codesRef.current.includes(code) || taken.has(code)) {
      setMessage({ ok: false, text: "Այս կոդն արդեն ավելացված է" });
      return;
    }
    const next = [...codesRef.current, code];
    onChange(next);
    setMessage({ ok: true, text: `Ավելացավ (${next.length})` });
    try {
      navigator.vibrate?.(80);
    } catch {
      /* no vibration */
    }
  };
  const addRef = useRef(add);
  addRef.current = add;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame: number | null = null;
    let controls: { stop: () => void } | null = null;

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;
      // The built-in detector (Android) when it reads both formats; zxing otherwise (Windows).
      const BarcodeDetectorClass = (
        window as unknown as { BarcodeDetector?: (new (o: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> } }
      ).BarcodeDetector;
      const formats = BarcodeDetectorClass?.getSupportedFormats ? await BarcodeDetectorClass.getSupportedFormats().catch(() => []) : [];
      try {
        if (BarcodeDetectorClass && formats.includes("qr_code") && formats.includes("data_matrix")) {
          stream = await navigator.mediaDevices
            .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } })
            .catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
          if (stopped) return;
          video.srcObject = stream;
          await video.play();
          const detector = new BarcodeDetectorClass({ formats: ["qr_code", "data_matrix"] });
          const scan = async () => {
            if (stopped) return;
            try {
              const found = await detector.detect(video);
              found.forEach((b) => b.rawValue && addRef.current(b.rawValue));
            } catch {
              /* next frame */
            }
            frame = requestAnimationFrame(scan);
          };
          scan();
        } else {
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video, (result) => {
            const text = result?.getText();
            if (text) addRef.current(text);
          });
          if (stopped) controls.stop();
        }
      } catch (err) {
        console.error("eMark camera failed", err);
        setCameraError("Տեսախցիկը չի միանում. թույլատրեք հասանելիությունը կամ մուտքագրեք կոդը ներքևում։");
      }
    };
    start();

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-xl bg-card p-4 text-card-foreground shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">EMark · {title}</h3>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold tabular-nums">{codes.length} հատ</span>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="aspect-square w-full object-cover" playsInline autoPlay muted />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`h-1/2 w-1/2 rounded-md border-2 ${message?.ok ? "border-green-400" : "border-yellow-400"}`} />
          </div>
        </div>
        {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}
        {message && (
          <p className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
            {message.ok ? "✓ " : "⚠ "}
            {message.text}
          </p>
        )}

        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && manual.trim()) {
              lastRef.current = null;
              add(manual.trim());
              setManual("");
            }
          }}
          placeholder="Կամ մուտքագրեք / սկաներով՝ Enter"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
          aria-label="eMark կոդ"
        />

        {codes.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {codes.map((code, i) => (
              <li key={code} className="flex items-center justify-between gap-2 rounded bg-muted px-2 py-1">
                <span className="truncate font-mono" title={code}>
                  {i + 1}. {showEmark(code, 40)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(codes.filter((c) => c !== code))}
                  className="shrink-0 rounded px-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-700"
                  aria-label="Ջնջել կոդը"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Պատրաստ է
          </button>
        </div>
      </div>
    </div>
  );
}
