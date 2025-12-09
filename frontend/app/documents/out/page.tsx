import dynamic from "next/dynamic";

const DocumentsOutPageClient = dynamic(
  () => import("./DocumentsOutPageClient"),
  {
    ssr: false,
  },
);


import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocumentsOutPageClient />
    </Suspense>
  );
}
