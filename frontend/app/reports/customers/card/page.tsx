import dynamic from "next/dynamic";

const CustomerCardClient = dynamic(() => import("./CustomerCardClient"), {
  ssr: false,
});

export default function Page() {
  return <CustomerCardClient />;
}
