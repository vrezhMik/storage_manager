"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ClientPage from "../[id]/ClientPage";

export default function SingleOutPageClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || undefined;

  return (
    <Suspense fallback={null}>
      <ClientPage id={id} />
    </Suspense>
  );
}
