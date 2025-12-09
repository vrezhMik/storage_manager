"use client";

import { useSearchParams } from "next/navigation";
import ClientPage from "../[id]/ClientPage";

export default function Page() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || undefined;
  return <ClientPage id={id} />;
}
