"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useRouter } from "next/navigation";
import CameraIcon from "../../../UI/CameraIcon";
import ChevronLeftIcon from "../../../UI/ChevronLeftIcon";
import KeyIcon from "../../../UI/KeyIcon";
import LogoutIcon from "../../../UI/LogoutIcon";
import MinusIcon from "../../../UI/MinusIcon";
import PlusIcon from "../../../UI/PlusIcon";
import SaveIcon from "../../../UI/SaveIcon";
import SendIcon from "../../../UI/SendIcon";
import ScanIcon from "../../../UI/ScanIcon";
import AuthGuard from "../../../components/AuthGuard";
import { clearAuthStorage } from "../../../lib/auth";

const baseItems = [
  {
    code: "IMP-2024-001",
    desc: "Բժշկական սարքավորում",
    location: "A-05-10",
    total: 10,
    current: 0,
    stock: 12,
  },
  {
    code: "IMP-2024-002",
    desc: "Դեղորայքներ",
    location: "B-12-08",
    total: 20,
    current: 0,
    stock: 34,
  },
  {
    code: "IMP-2024-003",
    desc: "Վիրակապի նյութեր",
    location: "C-18-15",
    total: 15,
    current: 0,
    stock: 20,
  },
  {
    code: "IMP-2024-004",
    desc: "Լաբորատոր սարքավորում",
    location: "D-22-05",
    total: 5,
    current: 0,
    stock: 7,
  },
  {
    code: "IMP-2024-005",
    desc: "Պաշտպանիչ միջոցներ",
    location: "E-10-20",
    total: 30,
    current: 0,
    stock: 50,
  },
  {
    code: "9785353004325",
    desc: "Գիրք (թեստ)",
    location: "Test",
    total: 5,
    current: 0,
    stock: 5,
  },
];

const statusColorClass = (current: number, total: number) => {
  if (current < total) return "text-muted-foreground";
  if (current === total) return "text-[hsl(var(--success))]";
  return "text-[hsl(var(--destructive))]";
};

type Props = { params: { id: string } };

type Item = (typeof baseItems)[number];

export default function InOrderDetail({ params }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"manual" | "camera" | "device">("manual");
  const [items, setItems] = useState<Item[]>(baseItems);
  const itemsRef = useRef<Item[]>(baseItems);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop?: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastScanRef = useRef<{ code: string; time: number } | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storageKey = useMemo(() => `in-order-${params.id}`, [params.id]);
  const handleLogout = () => {
    clearAuthStorage();
    router.replace("/login");
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setItems(parsed);
            itemsRef.current = parsed;
          }
        } catch {
          // ignore malformed storage
        }
      }
    }
  }, [storageKey]);

  useEffect(() => {
    const handleDetection = (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.code === code &&
        now - lastScanRef.current.time < 1000
      ) {
        return;
      }

      setBarcode(code);
      const match = itemsRef.current.find((i) => i.code === code);
      if (match) {
        setScanError(null);
        updateItem(code, 1);
        setHighlighted(code);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => setHighlighted(null), 1200);
        const target = itemRefs.current[code];
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setTab("manual");
      } else {
        setScanError("Բարկոդը չի գտնվել ապրանքների ցանկում");
      }
      lastScanRef.current = { code, time: now };
    };

    const startCamera = async () => {
      const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
      if (hasDetector) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          await startScanDetector(handleDetection);
        } catch {
          setScanError("Բարկոդ ընթերցումը հասանելի չէ այս սարքում");
        }
      } else {
        await startZxing(handleDetection);
      }
    };

    const startZxing = async (onDetected: (code: string) => void) => {
      if (!videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      zxingRef.current = reader;
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, err) => {
            if (result?.getText()) {
              onDetected(result.getText());
            } else if (err && err.name !== "NotFoundException") {
              setScanError("Չհաջողվեց ընթերցել բարկոդը");
            }
          }
        );
        zxingControlsRef.current = controls as unknown as { stop?: () => void };
      } catch {
        setScanError("Բարկոդ ընթերցումը հասանելի չէ այս սարքում");
      }
    };

    const startScanDetector = async (onDetected: (code: string) => void) => {
      if (typeof window === "undefined") return;
      if (!("BarcodeDetector" in window)) {
        return;
      }
      if (!detectorRef.current) {
        detectorRef.current = new BarcodeDetector({
          formats: ["code_128", "ean_13", "ean_8", "qr_code"],
        });
      }
      const scan = async () => {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue ?? "";
            onDetected(raw);
          }
        } catch {
          setScanError("Չհաջողվեց ընթերցել բարկոդը");
        }
        rafRef.current = requestAnimationFrame(scan);
      };
      scan();
    };

    const stopCamera = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (zxingControlsRef.current?.stop) {
        zxingControlsRef.current.stop();
        zxingControlsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      detectorRef.current = null;
      setBarcode(null);
      setScanError(null);
      lastScanRef.current = null;
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };

    if (tab === "camera") {
      startCamera();
    } else {
      stopCamera();
    }

    return stopCamera;
  }, [tab]);

  const updateItem = (code: string, delta: number) => {
    setItems((prev) => {
      const updated = prev.map((item) => {
        if (item.code !== code) return item;
        const increment = delta > 0 ? delta : 0;
        const decrement = delta < 0 ? Math.min(Math.abs(delta), item.current) : 0;
        const nextCurrent = Math.max(0, item.current + increment - decrement);
        const nextStock =
          typeof item.stock === "number"
            ? Math.max(0, item.stock + increment - decrement)
            : item.stock;
        return { ...item, current: nextCurrent, stock: nextStock };
      });
      itemsRef.current = updated;
      return updated;
    });
  };

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const handleSave = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(itemsRef.current));
  };

  return (
    <AuthGuard>
      <div className="App">
        <div className="min-h-screen bg-background">
          <header className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push("/documents/in")}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <h1 className="text-lg font-semibold text-foreground">
                  Մուտք № {params.id}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0">
                  <KeyIcon className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                  onClick={handleLogout}
                >
                  <LogoutIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow">
              <div className="p-6 pt-6">
                <div dir="ltr" data-orientation="horizontal" className="w-full">
                  <div
                    role="tablist"
                    aria-orientation="horizontal"
                    className="h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground grid w-full grid-cols-3"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "manual"}
                      data-state={tab === "manual" ? "active" : "inactive"}
                      onClick={() => setTab("manual")}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow text-xs"
                    >
                      <PlusIcon className="h-3.5 w-3.5 mr-1" />
                      Ձեռքով
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "camera"}
                      data-state={tab === "camera" ? "active" : "inactive"}
                      onClick={() => setTab("camera")}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow text-xs"
                    >
                      <CameraIcon className="h-3.5 w-3.5 mr-1" />
                      Տեսախցիկ
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "device"}
                      data-state={tab === "device" ? "active" : "inactive"}
                      onClick={() => setTab("device")}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow text-xs"
                    >
                      <ScanIcon className="h-3.5 w-3.5 mr-1" />
                      Սարք
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow">
              <div className="flex flex-col space-y-1.5 p-6 pb-3">
                <div className="font-semibold tracking-tight text-base">Ապրանքներ</div>
              </div>
              <div className="p-0 space-y-0">
                {tab === "camera" && (
                  <div className="border-b border-border bg-black/60 text-white">
                    <video
                      ref={videoRef}
                      className="w-full rounded-b-xl"
                      playsInline
                      muted
                    />
                    <div className="px-4 py-2 text-xs text-white/80 flex justify-between">
                      <span>{barcode ? `Գտնված բարկոդը: ${barcode}` : "Սկանավորում..."}</span>
                      {scanError && <span className="text-red-400">{scanError}</span>}
                    </div>
                  </div>
                )}
                <div className="space-y-0">
                  {items.map((item) => (
                    <div
                      key={item.code}
                      ref={(el) => {
                        itemRefs.current[item.code] = el;
                      }}
                      className={`p-4 space-y-3 border-b border-border last:border-none ${
                        highlighted === item.code ? "bg-success-light/40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground">
                            {item.desc}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                        
                          <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-muted text-muted-foreground border-border shrink-0">
                            <span className={statusColorClass(item.current, item.total)}>
                              {item.current}/{item.total}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Կոդ: {item.code}</span>
                        {item.location ? (
                          <>
                            <span>•</span>
                            <span>Հասցե: {item.location}</span>
                          </>
                        ) : null}
                      </div>
                      {tab === "manual" ? (
                        <div className="flex items-center gap-2">
                          <button
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                            onClick={() => updateItem(item.code, -1)}
                          >
                            <MinusIcon className="h-4 w-4" />
                          </button>
                          <div className="flex-1 text-center">
                            <span
                              className={`text-lg font-semibold ${statusColorClass(
                                item.current,
                                item.total
                              )}`}
                            >
                              {item.current}
                            </span>
                            <span className="text-sm text-muted-foreground"> / {item.total}</span>
                          </div>
                          <button
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                            onClick={() => updateItem(item.code, 1)}
                          >
                            <PlusIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center text-sm text-muted-foreground">
                          {item.current} / {item.total}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground px-4 py-2 h-12"
                onClick={handleSave}
              >
                <SaveIcon className="mr-2 h-4 w-4" />
                Պահպանել
              </button>
              <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-12">
                <SendIcon className="mr-2 h-4 w-4" />
                Ուղարկել
              </button>
            </div>
          </div>
        </main>
      </div>
      <section
        aria-label="Notifications alt+T"
        tabIndex={-1}
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
      ></section>
    </div>
    </AuthGuard>
  );
}
