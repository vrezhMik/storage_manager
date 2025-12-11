'use client';

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearAuthStorage,
  authFetch,
  API_BASE,
  refreshAccessToken,
  USER_EMAIL_KEY,
} from "../lib/auth";

type Props = {
  children: ReactNode;
};

const getInitialAllowed = () => {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(USER_EMAIL_KEY));
};

export default function AuthGuard({ children }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean>(getInitialAllowed);

  useEffect(() => {
    if (!allowed) {
      router.replace("/login");
      return;
    }

    const controller = new AbortController();
    let active = true;
    let refreshed = false;

    const ensure = async () => {
      try {
        await authFetch(`${API_BASE}/auth/me`, {
          signal: controller.signal,
        });
        if (!active) return;
        setAllowed(true);
      } catch (err: any) {
        if (!active) return;
        if (err?.name === "AbortError") return;

        if (!refreshed) {
          refreshed = await refreshAccessToken();
          if (refreshed) {
            try {
              await authFetch(`${API_BASE}/auth/me`, {
                signal: controller.signal,
              });
              return;
            } catch {
              // fall through to logout
            }
          }
        }

        clearAuthStorage();
        setAllowed(false);
        router.replace("/login");
      }
    };

    ensure();
    return () => {
      active = false;
      controller.abort();
    };
  }, [allowed, router]);

  if (!allowed) return null;

  return <>{children}</>;
}
