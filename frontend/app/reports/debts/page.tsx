import dynamic from "next/dynamic";

const DebtsPageClient = dynamic(() => import("./DebtsPageClient"), {
  ssr: false,
});

export default function Page() {
  return <DebtsPageClient />;
}
