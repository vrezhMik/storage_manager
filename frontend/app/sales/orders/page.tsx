import dynamic from "next/dynamic";

const OrdersListClient = dynamic(() => import("./OrdersListClient"), {
  ssr: false,
});

export default function Page() {
  return <OrdersListClient />;
}
