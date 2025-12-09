import dynamic from "next/dynamic";

const SingleOutPageClient = dynamic(
  () => import("./SingleOutPageClient"),
  {
    ssr: false,
  },
);


import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SingleOutPageClient />
    </Suspense>
  );
}
