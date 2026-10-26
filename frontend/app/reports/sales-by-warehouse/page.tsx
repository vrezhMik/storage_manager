import dynamic from "next/dynamic";

const SalesByWarehousePageClient = dynamic(() => import("./SalesByWarehousePageClient"), {
  ssr: false,
});

export default function Page() {
  return <SalesByWarehousePageClient />;
}
