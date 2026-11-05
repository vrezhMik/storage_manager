import dynamic from "next/dynamic";

const SalesListClient = dynamic(() => import("./SalesListClient"), {
  ssr: false,
});

export default function Page() {
  return <SalesListClient />;
}
