"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import CameraIcon from "../../../UI/CameraIcon";
import MinusIcon from "../../../UI/MinusIcon";
import PlusIcon from "../../../UI/PlusIcon";
import SaveIcon from "../../../UI/SaveIcon";
import SendIcon from "../../../UI/SendIcon";
import ScanIcon from "../../../UI/ScanIcon";
import AuthGuard from "../../../components/AuthGuard";
import { USER_MANUAL_ALLOWED_KEY, API_BASE } from "../../../lib/auth";
import { PurchaseDoc } from "../page";

const STORAGE_KEY = "purchases-data";

const statusColorClass = (current: number, total: number) => {
  if (current < total) return "text-muted-foreground";
  if (current === total) return "text-[hsl(var(--success))]";
  return "text-[hsl(var(--destructive))]";
};

type Props = { params: { id: string } };

type Item = {
  code: string;
  name: string;
  itemId: string;
  articul: string;
  location: string;
  total: number;
  current: number;
  stock: number;
};

export default function InOrderDetail({ params }: Props) {
  const [doc, setDoc] = useState<PurchaseDoc | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: PurchaseDoc[] = JSON.parse(raw);
      const found = parsed.find((d) => d.id === params.id) ?? null;
      setDoc(found);
    } catch {
      setDoc(null);
    }
  }, [params.id]);
  const baseItems = useMemo<Item[]>(() => {
    const mapped = doc?.items?.map((item) => ({
      code: item?.Barcode || item?.ItemID || "-",
      name: item?.Name || item?.ItemID || "",
      itemId: item?.ItemID || "",
      articul: item?.Articul || "",
      location: item?.ItemAddress || "",
      total: Number(item?.Quantity) || 0,
      current: 0,
      stock: 0,
    }));
    return mapped && mapped.length > 0 ? mapped : [];
  }, [doc]);
  const canManual = useMemo(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(USER_MANUAL_ALLOWED_KEY);
    return stored !== "false";
  }, []);
  const [tab, setTab] = useState<"manual" | "camera" | "device">(() => {
    if (typeof window === "undefined") return "manual";
    const stored = window.localStorage.getItem(USER_MANUAL_ALLOWED_KEY);
    return stored === "false" ? "device" : "manual";
  });
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>(baseItems);
  const itemsRef = useRef<Item[]>(baseItems);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
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
  const handledScanRef = useRef(false);
  const stopCameraRef = useRef<() => void>(() => {});
  const [cameraActive, setCameraActive] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deviceBufferRef = useRef<string>("");
  const deviceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deviceIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storageKey = useMemo(() => `in-order-${params.id}`, [params.id]);
  const hasBarcode = Boolean(barcode);

  useEffect(() => {
    if (!canManual && tab === "manual") setTab("device");
  }, [canManual, tab]);

  const processCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const match =
      itemsRef.current.find((i) => i.code === code || i.itemId === code) ||
      null;
    if (match) {
      setManualError(null);
      focusItem(match.code);
      updateItem(match.code, 1);
      setManualCode("");
    } else {
      setManualError("Բարկոդը չի գտնվել ցանկում");
      setManualCode("");
    }
  };

  useEffect(() => {
    if (tab === "device" && manualInputRef.current) {
      manualInputRef.current.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "device") return;
      e.stopPropagation();
      const key = e.key;
      if (key === "Enter") {
        e.preventDefault();
        const code = deviceBufferRef.current;
        deviceBufferRef.current = "";
        if (deviceTimeoutRef.current) {
          clearTimeout(deviceTimeoutRef.current);
          deviceTimeoutRef.current = null;
        }
        if (deviceIdleTimeoutRef.current) {
          clearTimeout(deviceIdleTimeoutRef.current);
          deviceIdleTimeoutRef.current = null;
        }
        processCode(code);
        return;
      }
      if (key.length === 1) {
        deviceBufferRef.current += key;
        if (deviceTimeoutRef.current) clearTimeout(deviceTimeoutRef.current);
        deviceTimeoutRef.current = setTimeout(() => {
          deviceBufferRef.current = "";
        }, 600);
        if (deviceIdleTimeoutRef.current)
          clearTimeout(deviceIdleTimeoutRef.current);
        deviceIdleTimeoutRef.current = setTimeout(() => {
          const buffered = deviceBufferRef.current;
          deviceBufferRef.current = "";
          if (buffered) processCode(buffered);
        }, 900);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (deviceTimeoutRef.current) clearTimeout(deviceTimeoutRef.current);
      if (deviceIdleTimeoutRef.current)
        clearTimeout(deviceIdleTimeoutRef.current);
    };
  }, [tab]);

  const focusItem = (code: string) => {
    const target = itemRefs.current[code];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(code);
      if (highlightTimeoutRef.current)
        clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(
        () => setHighlighted(null),
        1200
      );
    }
  };

  const mergeWithBase = (saved: Item[] | null | undefined): Item[] => {
    if (!baseItems.length) return saved ?? [];
    const lookup = new Map<string, Item>();
    baseItems.forEach((i) => lookup.set(i.code || i.itemId, i));
    if (saved && saved.length) {
      return saved.map((s) => {
        const key = s.code || s.itemId;
        const base = key ? lookup.get(key) : undefined;
        return {
          ...s,
          name: s.name || base?.name || "",
          itemId: s.itemId || base?.itemId || "",
          articul: s.articul || base?.articul || "",
          location: s.location || base?.location || "",
          total: base?.total ?? s.total ?? 0,
        };
      });
    }
    return baseItems;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const merged = mergeWithBase(parsed);
            setItems(merged);
            itemsRef.current = merged;
            return;
          }
        } catch {
          // ignore malformed storage
        }
      }
      if (baseItems.length > 0) {
        const merged = mergeWithBase(baseItems);
        setItems(merged);
        itemsRef.current = merged;
      }
    }
  }, [storageKey, baseItems]);

  useEffect(() => {
    const handleDetection = (raw: string) => {
      if (handledScanRef.current) return;
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
        if (highlightTimeoutRef.current)
          clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(
          () => setHighlighted(null),
          1200
        );
        const target = itemRefs.current[code];
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        handledScanRef.current = true;
        setTimeout(() => {
          stopCameraRef.current();
          setCameraActive(false);
        }, 250);
      } else {
        setScanError("Բարկոդը չի գտնվել ապրանքների ցանկում");
      }
      lastScanRef.current = { code, time: now };
    };

    const startCamera = async () => {
      if (streamRef.current) return;
      const hasDetector =
        typeof window !== "undefined" && "BarcodeDetector" in window;

      const requestStream = async () => {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
        } catch {
          return await navigator.mediaDevices.getUserMedia({ video: true });
        }
      };

      try {
        const stream = await requestStream();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (hasDetector) {
          await startScanDetector(handleDetection);
        } else {
          await startZxing(handleDetection);
        }
      } catch (err) {
        console.error("Camera start failed", err);
        setScanError(
          "Տեսախցիկը չի միանում․ թույլատրեք հասանելիությունը և փորձեք կրկին"
        );
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
      handledScanRef.current = false;
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
    stopCameraRef.current = stopCamera;

    if (tab === "camera" && cameraActive) {
      startCamera();
    } else {
      stopCamera();
    }

    return stopCamera;
  }, [tab, cameraActive]);

  const updateItem = (code: string, delta: number) => {
    setItems((prev) => {
      const updated = prev.map((item) => {
        if (item.code !== code) return item;
        const increment = delta > 0 ? delta : 0;
        const decrement =
          delta < 0 ? Math.min(Math.abs(delta), item.current) : 0;
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

  const formatTransactionDate = (value?: string | null) => {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    const day = pad(parsed.getDate());
    const month = pad(parsed.getMonth() + 1);
    const year = parsed.getFullYear();
    const hours = pad(parsed.getHours());
    const minutes = pad(parsed.getMinutes());
    const seconds = pad(parsed.getSeconds());
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
  };

  const handleSend = async () => {
    setSendError(null);
    if (!doc) return;
    const payload = {
      Number: doc.id,
      ClientID: doc.clientId ?? "",
      TransactionDate: formatTransactionDate(doc.transactionDate || doc.date),
      Items: items
        .filter((i) => i.current > 0)
        .map((i) => ({
          ItemID: i.itemId || i.code,
          Quantity: i.current,
        })),
    };

    if (payload.Items.length === 0) {
      setSendError("Քանակ նշված չէ ուղարկելու համար");
      return;
    }

    try {
      setSendLoading(true);
      const res = await fetch(`${API_BASE}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let message = `Չհաջողվեց ուղարկել (${res.status})`;
        try {
          const body = JSON.parse(text);
          message = body?.message ?? message;
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }
    } catch (err: any) {
      setSendError(err?.message ?? "Չհաջողվեց ուղարկել");
    } finally {
      setSendLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow">
              <div className="p-6 pt-6">
                <div dir="ltr" data-orientation="horizontal" className="w-full">
                  <div
                    role="tablist"
                    aria-orientation="horizontal"
                    className={`h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground grid w-full ${
                      canManual ? "grid-cols-3" : "grid-cols-2"
                    }`}
                  >
                    {canManual && (
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
                    )}
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
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      processCode(manualCode);
                      if (tab === "device") {
                        setTimeout(() => manualInputRef.current?.focus(), 0);
                      } else if (canManual) {
                        setTab("manual");
                      }
                    }}
                  >
                    <input
                      ref={manualInputRef}
                      className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder={
                        tab === "device"
                          ? "Սկանավորեք սարքով"
                          : "Մուտքագրեք բարկոդը"
                      }
                      autoFocus={tab === "device"}
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90"
                    >
                      Գտնել
                    </button>
                  </form>
                  {manualError && (
                    <p className="mt-2 text-xs text-red-600">{manualError}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow">
              <div className="flex flex-col space-y-1.5 p-6 pb-3">
                <div className="font-semibold tracking-tight text-base">
                  Ապրանքներ
                </div>
              </div>
              <div className="p-0 space-y-0">
                {tab === "camera" && (
                  <div className="relative border-b border-border bg-black/60 text-white">
                    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/70">
                      <button
                        type="button"
                        onClick={() => setCameraActive((v) => !v)}
                        className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black shadow transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:ring-yellow-400"
                      >
                        <CameraIcon className="h-4 w-4" />
                        {cameraActive ? "Անջատել" : "Միացնել տեսախցիկը"}
                      </button>
                    </div>
                    {cameraActive ? (
                      <>
                        <video
                          ref={videoRef}
                          className="w-full rounded-b-xl aspect-video object-cover bg-black"
                          playsInline
                          autoPlay
                          muted
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div
                            className={`h-40 w-64 rounded-md border-2 transition-colors duration-150 ${
                              hasBarcode
                                ? "border-green-400 shadow-[0_0_0_2px_rgba(34,197,94,0.35)]"
                                : "border-yellow-400 shadow-[0_0_0_2px_rgba(250,204,21,0.35)]"
                            }`}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="w-full rounded-b-xl bg-black/80 aspect-video flex items-center justify-center text-xs text-white/70">
                        Սկսեք սկանավորումը
                      </div>
                    )}
                    <div className="px-4 py-2 text-xs text-white/80 flex justify-between">
                      <span>
                        {barcode
                          ? `Գտնված բարկոդը: ${barcode}`
                          : cameraActive
                          ? "Սկանավորում..."
                          : "Տեսախցիկը անջատված է"}
                      </span>
                      {scanError && (
                        <span className="text-red-400">{scanError}</span>
                      )}
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
                            {item.name || item.itemId || "Անվանում չկա"}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                          <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-muted text-muted-foreground border-border shrink-0">
                            <span
                              className={statusColorClass(
                                item.current,
                                item.total
                              )}
                            >
                              {item.current}/{item.total}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Կոդ: {item.itemId || item.code}</span>
                        <span>•</span>
                        <span>Բարկոդ: {item.code || "—"}</span>
                        {item.location ? (
                          <>
                            <span>•</span>
                            <span>Հասցե: {item.location}</span>
                          </>
                        ) : null}
                        {item.articul ? (
                          <>
                            <span>•</span>
                            <span>Արտիկուլ: {item.articul}</span>
                          </>
                        ) : null}
                      </div>
                      {tab === "manual" ? (
                        <div className="flex items-center gap-2">
                          <button
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                            onClick={() => updateItem(item.code, -1)}
                            disabled={!canManual}
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
                            <span className="text-sm text-muted-foreground">
                              {" "}
                              / {item.total}
                            </span>
                          </div>
                          <button
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                            onClick={() => updateItem(item.code, 1)}
                            disabled={!canManual}
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
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-12"
                onClick={handleSend}
                disabled={sendLoading}
              >
                <SendIcon className="mr-2 h-4 w-4" />
                {sendLoading ? "Ուղարկվում է..." : "Ուղարկել 1C"}
              </button>
            </div>
            {sendError && (
              <div className="mt-3 text-sm text-red-600">{sendError}</div>
            )}
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
    </AuthGuard>
  );
}
