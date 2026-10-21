import dynamic from "next/dynamic";

const ReportsPageClient = dynamic(() => import("./ReportsPageClient"), {
  ssr: false,
});

export default function Page() {
  return <ReportsPageClient />;
}
