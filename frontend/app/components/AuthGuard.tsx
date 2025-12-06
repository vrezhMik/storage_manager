'use client';

import { ReactNode, useEffect, useState } from "react";
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

  useEffect(() => {
    if (hasCheckedOnce) {
      // Already verified in this session; keep state in sync and skip network call.
      setAllowed(lastAllowed);
      if (!lastAllowed) router.replace("/login");
      return;
    }
    const controller = new AbortController();
    let active = true;
    const ensure = async () => {
      try {
        const res = await authFetch(`${API_BASE}/auth/me`, { signal: controller.signal });
        if (!active) return;
        if (!res.ok) {
          clearAuthStorage();
          hasCheckedOnce = true;
          lastAllowed = false;
          router.replace("/login");
          return;
        }
        hasCheckedOnce = true;
        lastAllowed = true;
        setAllowed(true);
      } catch (err: any) {
        if (!active) return;
        if (err?.name === "AbortError") return;
        clearAuthStorage();
        hasCheckedOnce = true;
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
