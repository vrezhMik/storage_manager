import dynamic from "next/dynamic";

const SuppliersClient = dynamic(() => import("./SuppliersClient"), {
  ssr: false,
});

export default function Page() {
  return <SuppliersClient />;
}
