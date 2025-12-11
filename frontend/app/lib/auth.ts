export const ACCESS_TOKEN_KEY = "access_token";
export const REFRESH_TOKEN_KEY = "refresh_token";
export const ACCESS_EXPIRES_AT_KEY = "access_expires_at";
export const USER_EMAIL_KEY = "user_email";
export const USER_MANUAL_ALLOWED_KEY = "user_manual_allowed";
export const USER_MANUAL_TEXT_ALLOWED_KEY = "user_manual_text_allowed";

const isBrowser = typeof window !== "undefined";
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "https://admin.flexit.am/api";
export { API_BASE };

export function storeAuthTokens(data: {
  user?: {
    email?: string;
    allow_manual_items?: boolean;
    allow_manual_text_input?: boolean;
  };
}) {
  if (!isBrowser) return;
  if (data.user?.email) {
    window.localStorage.setItem(USER_EMAIL_KEY, data.user.email);
  }
  if (typeof data.user?.allow_manual_items === "boolean") {
    window.localStorage.setItem(
      USER_MANUAL_ALLOWED_KEY,
      String(data.user.allow_manual_items),
    );
  }
  if (typeof data.user?.allow_manual_text_input === "boolean") {
    window.localStorage.setItem(
      USER_MANUAL_TEXT_ALLOWED_KEY,
      String(data.user.allow_manual_text_input),
    );
  }
}

export function clearAuthStorage() {
  if (!isBrowser) return;
  [
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    ACCESS_EXPIRES_AT_KEY,
    USER_EMAIL_KEY,
    USER_MANUAL_ALLOWED_KEY,
    USER_MANUAL_TEXT_ALLOWED_KEY,
  ].forEach((key) => window.localStorage.removeItem(key));
}

export async function apiLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch {
    // ignore
  } finally {
    clearAuthStorage();
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    clearAuthStorage();
    return false;
  }

  const data = await res.json();
  storeAuthTokens(data);
  return true;
}

function normalizeHeaders(existing: HeadersInit | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (existing instanceof Headers) {
    existing.forEach((v, k) => {
      headers[k] = v;
    });
  } else if (Array.isArray(existing)) {
    existing.forEach(([k, v]) => {
      headers[k] = v as string;
    });
  } else if (existing) {
    Object.assign(headers, existing as Record<string, string>);
  }
  return headers;
}

export async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const fetchOptions: RequestInit = {
    ...init,
    cache: init.cache ?? "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  };

  const res = await fetch(url, fetchOptions);

  if (res.status === 401) {
    // Attempt refresh if 401, trying to preserve original logic if possible, 
    // but the user's snippet threw 'Unauthorized'.
    // I'll stick to the user's requested pattern which is safer and simpler for debugging.
    // If they need refresh, they might add it back or it's handled by valid cookie sessions.
    // Actually, the original code had refresh logic. I'll add a minimal check or just throw as requested.
    // User snippet: "if (res.status === 401) { throw new Error("Unauthorized"); }"
    // I'll follow that to be safe.
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  // Handle cases where response might not be JSON
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : (undefined as T);
  } catch {
    return text as unknown as T;
  }
}
