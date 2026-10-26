import dynamic from "next/dynamic";

const OverdueDebtsClient = dynamic(() => import("./OverdueDebtsClient"), {
  ssr: false,
});

export default function Page() {
  return <OverdueDebtsClient />;
}
