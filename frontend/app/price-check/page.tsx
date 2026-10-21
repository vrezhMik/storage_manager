import dynamic from "next/dynamic";

const PriceCheckClient = dynamic(() => import("./PriceCheckClient"), {
  ssr: false,
});

export default function Page() {
  return <PriceCheckClient />;
}
