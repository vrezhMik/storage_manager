import dynamic from "next/dynamic";

const RetailClient = dynamic(() => import("./RetailClient"), {
  ssr: false,
});

export default function Page() {
  return <RetailClient />;
}
