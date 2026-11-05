import dynamic from "next/dynamic";

const SalesFormClient = dynamic(() => import("./SalesFormClient"), {
  ssr: false,
});

export default function Page() {
  return <SalesFormClient />;
}
