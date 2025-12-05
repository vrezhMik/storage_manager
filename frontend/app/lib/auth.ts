export const ACCESS_TOKEN_KEY = "access_token";
export const REFRESH_TOKEN_KEY = "refresh_token";
export const ACCESS_EXPIRES_AT_KEY = "access_expires_at";
export const USER_EMAIL_KEY = "user_email";
export const USER_MANUAL_ALLOWED_KEY = "user_manual_allowed";

const isBrowser = typeof window !== "undefined";

export function storeAuthTokens(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { email?: string; allow_manual_items?: boolean };
}) {
  if (!isBrowser) return;
  const accessExpiresAt = Date.now() + (data.expires_in ?? 0) * 1000;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  window.localStorage.setItem(ACCESS_EXPIRES_AT_KEY, String(accessExpiresAt));
  if (data.user?.email) {
    window.localStorage.setItem(USER_EMAIL_KEY, data.user.email);
  }
  if (typeof data.user?.allow_manual_items === "boolean") {
    window.localStorage.setItem(
      USER_MANUAL_ALLOWED_KEY,
      String(data.user.allow_manual_items),
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
  ].forEach((key) => window.localStorage.removeItem(key));
}

export function isAuthenticated(): boolean {
  if (!isBrowser) return false;
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const exp = Number(window.localStorage.getItem(ACCESS_EXPIRES_AT_KEY));
  if (!token || Number.isNaN(exp)) return false;
  return Date.now() < exp;
}
