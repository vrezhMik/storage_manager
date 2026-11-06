import dynamic from "next/dynamic";

const HdmListClient = dynamic(() => import("./HdmListClient"), {
  ssr: false,
});

export default function Page() {
  return <HdmListClient />;
}
