import dynamic from "next/dynamic";

const ReportPlaceholder = dynamic(() => import("../components/ReportPlaceholder"), {
  ssr: false,
});

export default function Page() {
  return <ReportPlaceholder title="Պարտքեր" />;
}
