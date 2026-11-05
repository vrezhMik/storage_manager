import dynamic from "next/dynamic";

const SupplierCardClient = dynamic(() => import("./SupplierCardClient"), {
  ssr: false,
});

export default function Page() {
  return <SupplierCardClient />;
}
