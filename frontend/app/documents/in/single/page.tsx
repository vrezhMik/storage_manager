import dynamic from "next/dynamic";

const SingleInPageClient = dynamic(
  () => import("./SingleInPageClient"),
  {
    ssr: false,
  },
);


import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SingleInPageClient />
    </Suspense>
  );
}
