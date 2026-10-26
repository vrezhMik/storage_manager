"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import CameraIcon from "../UI/CameraIcon";
import PlusIcon from "../UI/PlusIcon";
import ScanIcon from "../UI/ScanIcon";
import AuthGuard from "../components/AuthGuard";
import {
  USER_MANUAL_ALLOWED_KEY,
  USER_MANUAL_TEXT_ALLOWED_KEY,
  API_BASE,
  authFetch,
} from "../lib/auth";

// 1C returns { Barcode, ItemID, ItemName, Price, Stock }; ItemName, Price and Stock are shown.
// Stock is either a single number or broken down by warehouse, in one of these shapes:
//   Stock: [{ Warehouse: "...", Stock: 5 }, ...]
//   Stock: { "<warehouse>": 5, ... }
//   several rows of the same item, each with its own Warehouse + Stock
type RawItem = Record<string, unknown>;

type WarehouseStock = { name: string; qty: unknown };

type PriceItem = {
  name: unknown;
  price: unknown;
  stock: unknown;
  warehouses: WarehouseStock[] | null;
  segment: unknown;
};

const WAREHOUSE_NAME_KEYS = ["Warehouse", "WarehouseName", "Store", "Склад", "СкладНаименование", "Name", "Наименование"];
const WAREHOUSE_QTY_KEYS = ["Stock", "Quantity", "Qty", "Остаток", "Количество"];

const pick = (obj: RawItem, keys: string[]) => {
  const key = keys.find((k) => k in obj);
  return key ? obj[key] : undefined;
};

const isRecord = (value: unknown): value is RawItem =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toWarehouses = (stock: unknown): WarehouseStock[] | null => {
  if (Array.isArray(stock)) {
    return stock.filter(isRecord).map((w) => ({
      name: String(pick(w, WAREHOUSE_NAME_KEYS) ?? "—"),
      qty: pick(w, WAREHOUSE_QTY_KEYS),
    }));
  }
  if (isRecord(stock)) {
    return Object.entries(stock).map(([name, qty]) => ({ name, qty }));
  }
  return null;
};

// Warehouse name at the item level (shape 3); "Name"-like keys are skipped
// there because they would clash with the item name.
const rowWarehouse = (row: RawItem) =>
  pick(row, ["Warehouse", "WarehouseName", "Store", "Склад", "СкладНаименование"]);

const toPriceItems = (data: unknown): PriceItem[] => {
  const rows = (Array.isArray(data) ? data : [data]).filter(
    (entry): entry is RawItem => isRecord(entry) && Boolean(entry.ItemName),
  );
  const items: PriceItem[] = [];
  const byKey = new Map<string, PriceItem>();

  rows.forEach((row) => {
    const warehouse = rowWarehouse(row);
    if (warehouse === undefined) {
      items.push({
        name: row.ItemName,
        price: row.Price,
        stock: row.Stock,
        warehouses: toWarehouses(row.Stock),
        segment: row.Segment,
      });
      return;
    }
    const key = String(row.ItemID ?? row.Barcode ?? row.ItemName);
    let item = byKey.get(key);
    if (!item) {
      item = {
        name: row.ItemName,
        price: row.Price,
        stock: undefined,
        warehouses: [],
        segment: row.Segment,
      };
      byKey.set(key, item);
      items.push(item);
    }
    item.warehouses!.push({ name: String(warehouse), qty: row.Stock });
  });

  return items;
};

const displayValue = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

const toNumber = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const formatQty = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

function WarehouseList({ warehouses }: { warehouses: WarehouseStock[] }) {
  if (warehouses.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const numbers = warehouses.map((w) => toNumber(w.qty));
  const total = numbers.every((n) => n !== null)
    ? numbers.reduce<number>((sum, n) => sum + (n ?? 0), 0)
    : null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="py-1 pr-3 text-left font-normal">Պահեստ</th>
          <th className="py-1 text-right font-normal">Մնացորդ</th>
        </tr>
      </thead>
      <tbody>
        {warehouses.map((w, idx) => (
          <tr key={`${w.name}-${idx}`} className="border-t border-border">
            <td className="py-1.5 pr-3 text-foreground break-words">{w.name}</td>
            <td className="py-1.5 text-right font-semibold text-foreground tabular-nums">
              {toNumber(w.qty) === null ? displayValue(w.qty) : formatQty(toNumber(w.qty)!)}
            </td>
          </tr>
        ))}
      </tbody>
      {warehouses.length > 1 && total !== null && (
        <tfoot>
          <tr className="border-t-2 border-border">
            <td className="py-1.5 pr-3 text-muted-foreground">Ընդամենը</td>
            <td className="py-1.5 text-right font-bold text-foreground tabular-nums">
              {formatQty(total)}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function PriceResult({ data }: { data: unknown }) {
  const items = toPriceItems(data);
  if (items.length === 0) {
    return <p className="text-sm text-red-600">Ապրանքը չի գտնվել</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="space-y-3 border-t border-border pt-3 first:border-0 first:pt-0">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2">
            <dt className="text-sm text-muted-foreground">Ապրանք</dt>
            <dd className="text-sm font-semibold text-foreground break-words">
              {displayValue(item.name)}
            </dd>
            <dt className="text-sm text-muted-foreground">Գին</dt>
            <dd className="text-lg font-semibold text-foreground">
              {displayValue(item.price)}
            </dd>
            {!item.warehouses && (
              <>
                <dt className="text-sm text-muted-foreground">Մնացորդ</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {displayValue(item.stock)}
                </dd>
              </>
            )}
          </dl>
          {item.warehouses && <WarehouseList warehouses={item.warehouses} />}
          {item.segment !== undefined && item.segment !== null && item.segment !== "" && (
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 border-t border-border pt-3">
              <dt className="text-sm text-muted-foreground">Խումբ</dt>
              <dd className="text-sm font-semibold text-foreground break-words">
                {displayValue(item.segment)}
              </dd>
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PriceCheckClient() {
  const [canManual, setCanManual] = useState(true);
  const [canManualTextInput, setCanManualTextInput] = useState(true);
  const [tab, setTab] = useState<"manual" | "camera" | "device">("manual");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedManual = window.localStorage.getItem(USER_MANUAL_ALLOWED_KEY);
    const storedText =
      window.localStorage.getItem(USER_MANUAL_TEXT_ALLOWED_KEY);
    setCanManual(storedManual !== "false");
    setCanManualTextInput(storedText !== "false");
    if (storedManual === "false") {
      setTab("device");
    }
  }, []);
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [searchedCode, setSearchedCode] = useState<string | null>(null);
  // undefined = nothing loaded yet, null = request failed or empty response
  const [result, setResult] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop?: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const lastScanRef = useRef<{ code: string; time: number } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const deviceBufferRef = useRef<string>("");
  const deviceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deviceIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasBarcode = Boolean(barcode);

  useEffect(() => {
    if (!canManual && tab === "manual") setTab("device");
  }, [canManual, tab]);

  const processCode = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) {
      setManualError("Մուտքագրեք բարկոդը");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setManualError(null);
    setSearchedCode(code);
    // Keep the searched barcode visible in the input, whatever the source.
    setManualCode(code);
    setResult(undefined);
    setLoading(true);
    try {
      const data = await authFetch<unknown>(
        `${API_BASE}/price-check?barcode=${encodeURIComponent(code)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setResult(data ?? null);
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === "AbortError") return;
      setResult(null);
      setManualError("Չհաջողվեց ստանալ տվյալները");
      console.error("Price check failed", err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

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
        // Mirror the scanner buffer into the input instead of letting keys
        // append to the previous barcode.
        e.preventDefault();
        deviceBufferRef.current += key;
        setManualCode(deviceBufferRef.current);
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
  }, [tab, processCode]);

  useEffect(() => {
    const handleDetection = (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.code === code &&
        now - lastScanRef.current.time < 3000
      ) {
        return;
      }
      lastScanRef.current = { code, time: now };
      setBarcode(code);
      setScanError(null);
      processCode(code);
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
    };

    if (tab === "camera" && cameraActive) {
      startCamera();
    } else {
      stopCamera();
    }

    return stopCamera;
  }, [tab, cameraActive, processCode]);

  return (
    <AuthGuard section="price_check">
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
                  {canManualTextInput && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
              {tab === "camera" && (
                <div className="relative border-t border-border bg-black text-white rounded-b-xl">
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
                    <div className="relative">
                      <video
                        ref={videoRef}
                        className="w-full aspect-video object-cover bg-black"
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
                    </div>
                  ) : (
                    <div className="w-full bg-black/80 aspect-video flex items-center justify-center text-xs text-white/70">
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
            </div>

            {searchedCode && (
              <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Բարկոդ</div>
                  <div className="text-lg font-semibold text-foreground">{searchedCode}</div>
                </div>
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
                  </div>
                ) : result !== undefined && result !== null ? (
                  <PriceResult data={result} />
                ) : null}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
