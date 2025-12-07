'use client';

import { ReactNode, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearAuthStorage, authFetch, API_BASE } from "../lib/auth";

let hasCheckedOnce = false;
let lastAllowed = true;

type Props = {
  children: ReactNode;
};

export default function AuthGuard({ children }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(() => (hasCheckedOnce ? lastAllowed : true));
  const checkedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedOnce || checkedRef.current) return;
    checkedRef.current = true;
    const controller = new AbortController();
    let active = true;
    // mark as checked up front to avoid duplicate fetches in React strict double-invoke
    hasCheckedOnce = true;
    const ensure = async () => {
      try {
        const res = await authFetch(`${API_BASE}/auth/me`, { signal: controller.signal });
        if (!active) return;
        if (!res.ok) {
          clearAuthStorage();
          lastAllowed = false;
          router.replace("/login");
          return;
        }
        lastAllowed = true;
        setAllowed(true);
      } catch (err: any) {
        if (!active) return;
        if (err?.name === "AbortError") return;
        clearAuthStorage();
        lastAllowed = false;
        router.replace("/login");
      }
    };
    ensure();
    return () => {
      active = false;
    };
  }, [router]);

  if (!allowed) return null;

  return <>{children}</>;
}
