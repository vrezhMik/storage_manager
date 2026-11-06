import { API_BASE, authFetch } from "./auth";

// In the Flexit apps (tools/desktop-app, later Android) the page gets
// window.flexitNative.request(): requests made by the device itself, with its
// own IP and without the browser's cross-site limits.

export type NativeRequest = (spec: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

type CapacitorHttp = {
  request: (options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    data?: string;
    responseType?: "text";
    connectTimeout?: number;
    readTimeout?: number;
  }) => Promise<{ status: number; headers: Record<string, string>; data: unknown }>;
};

type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { CapacitorHttp?: CapacitorHttp } };

// Android app (tools/android-app, Capacitor): native HTTP from the phone.
const capacitorBridge = (): { platform: string; request: NativeRequest } | null => {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const http = cap?.Plugins?.CapacitorHttp;
  if (!cap?.isNativePlatform?.() || !http) return null;
  return {
    platform: "android",
    request: async ({ url, method = "GET", headers = {}, body, timeoutMs = 30000 }) => {
      const res = await http.request({
        url,
        method,
        headers,
        data: body,
        responseType: "text",
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      return {
        status: res.status,
        headers: res.headers ?? {},
        body: typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? ""),
      };
    },
  };
};

export const nativeBridge = (): { platform: string; request: NativeRequest } | null => {
  if (typeof window === "undefined") return null;
  const desktop = (window as unknown as { flexitNative?: { platform: string; request: NativeRequest } }).flexitNative;
  return desktop ?? capacitorBridge();
};

/**
 * A report the device may ask 1C for itself (the Retail block). In the apps
 * the server only prepares the request (store and dates from the user's
 * account, ?device=1) and the device sends it; in a browser the server asks
 * 1C as before. `path` is relative to the API, e.g. "retail-plan?date=…".
 */
export const fetchDeviceReport = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const native = nativeBridge();
  if (!native) return authFetch<T>(`${API_BASE}/${path}`, { signal });

  const spec = await authFetch<{ url: string; headers: Record<string, string> }>(
    `${API_BASE}/${path}${path.includes("?") ? "&" : "?"}device=1`,
    { signal },
  );
  const res = await native.request({ url: spec.url, method: "GET", headers: spec.headers, timeoutMs: 60000 });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (res.status >= 400) throw new Error(`Request failed (${res.status}): ${res.body.slice(0, 300)}`);
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new Error(`Unexpected answer from 1C: ${res.body.slice(0, 200)}`);
  }
};
