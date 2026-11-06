import dynamic from "next/dynamic";

const HdmFormClient = dynamic(() => import("./HdmFormClient"), {
  ssr: false,
});

export default function Page() {
  return <HdmFormClient />;
}
