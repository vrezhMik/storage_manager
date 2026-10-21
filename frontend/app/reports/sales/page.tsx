import dynamic from "next/dynamic";

const SalesPageClient = dynamic(() => import("./SalesPageClient"), {
  ssr: false,
});

export default function Page() {
  return <SalesPageClient />;
}
