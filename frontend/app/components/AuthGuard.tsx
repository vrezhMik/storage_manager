'use client';

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthStorage, authFetch, API_BASE } from "../lib/auth";

type Props = {
  children: ReactNode;
};

export default function AuthGuard({ children }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    const ensure = async () => {
      try {
        const res = await authFetch(`${API_BASE}/auth/me`);
        if (!active) return;
        if (!res.ok) {
          clearAuthStorage();
          router.replace("/login");
          return;
        }
        setAllowed(true);
      } catch {
        if (!active) return;
        clearAuthStorage();
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
