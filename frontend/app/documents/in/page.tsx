import dynamic from "next/dynamic";

const DocumentsInPageClient = dynamic(
  () => import("./DocumentsInPageClient"),
  {
    ssr: false,
  },
);


import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocumentsInPageClient />
    </Suspense>
  );
}
