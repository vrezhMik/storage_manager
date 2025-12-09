"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ClientPage from "../[id]/ClientPage";

function Content() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || undefined;
  return <ClientPage id={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
