import dynamic from "next/dynamic";

const FrozenStockClient = dynamic(() => import("./FrozenStockClient"), {
  ssr: false,
});

export default function Page() {
  return <FrozenStockClient />;
}
