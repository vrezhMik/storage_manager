"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ClientPage from "../[id]/ClientPage";

function Content() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || undefined;
  return <ClientPage id={id} />;
}

function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

export default dynamic(() => Promise.resolve(Page), { ssr: false });
