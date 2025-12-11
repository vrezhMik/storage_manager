'use client';

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthStorage, authFetch, API_BASE } from "../lib/auth";

type Props = {
  children: ReactNode;
};

export default function AuthGuard({ children }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

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
  }, [router]);

  if (allowed !== true) return null;

  return <>{children}</>;
}
