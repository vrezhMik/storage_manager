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

async function refreshAccessToken(): Promise<boolean> {
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

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = normalizeHeaders(init.headers);
  const doFetch = () =>
    fetch(input, {
      ...init,
      credentials: "include",
      headers,
    });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      clearAuthStorage();
      throw new Error("Session expired");
    }
    res = await doFetch();
  }
  return res;
}
