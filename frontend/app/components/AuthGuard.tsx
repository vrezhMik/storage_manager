'use client';

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthStorage, isAuthenticated } from "../lib/auth";

type Props = {
  children: ReactNode;
};

export default function AuthGuard({ children }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const authed = isAuthenticated();
    if (!authed) {
      clearAuthStorage();
      router.replace("/login");
      return;
    }
    setAllowed(true);
  }, [router]);

  if (!allowed) return null;

  return <>{children}</>;
}
