import dynamic from "next/dynamic";

const SalesMonthlyClient = dynamic(() => import("./SalesMonthlyClient"), {
  ssr: false,
});

export default function Page() {
  return <SalesMonthlyClient />;
}
