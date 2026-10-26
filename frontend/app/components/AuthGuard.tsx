'use client';

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearAuthStorage,
  authFetch,
  API_BASE,
  refreshAccessToken,
  USER_EMAIL_KEY,
  Section,
  getUserSections,
  storeUserSections,
} from "../lib/auth";

export const SECTIONS_CHANGED_EVENT = "user-sections-changed";

type Props = {
  children: ReactNode;
  // When set, users without access to this section are sent to the home page.
  section?: Section;
};

const getInitialAllowed = () => {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(USER_EMAIL_KEY));
};

// Keep the stored sections in sync with the backend, so admin changes apply
// without logging out.
const syncSections = (me: any) => {
  if (!me?.sections) return;
  storeUserSections(me.sections);
  window.dispatchEvent(new Event(SECTIONS_CHANGED_EVENT));
};

export default function AuthGuard({ children, section }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean>(getInitialAllowed);
  const [sectionAllowed, setSectionAllowed] = useState<boolean>(
    () => !section || getUserSections()[section],
  );

  useEffect(() => {
    if (!section) return;
    const check = () => {
      const ok = getUserSections()[section];
      setSectionAllowed(ok);
      if (!ok) router.replace("/");
    };
    check();
    window.addEventListener(SECTIONS_CHANGED_EVENT, check);
    return () => window.removeEventListener(SECTIONS_CHANGED_EVENT, check);
  }, [section, router]);

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
        const me = await authFetch(`${API_BASE}/auth/me`, {
          signal: controller.signal,
        });
        if (!active) return;
        syncSections(me);
        setAllowed(true);
      } catch (err: any) {
        if (!active) return;
        if (err?.name === "AbortError") return;

        if (!refreshed) {
          refreshed = await refreshAccessToken();
          if (refreshed) {
            try {
              const me = await authFetch(`${API_BASE}/auth/me`, {
                signal: controller.signal,
              });
              if (active) syncSections(me);
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

  if (!allowed || !sectionAllowed) return null;

  return <>{children}</>;
}
