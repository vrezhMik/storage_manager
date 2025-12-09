import dynamic from "next/dynamic";

const DocumentsOutPageClient = dynamic(
  () => import("./DocumentsOutPageClient"),
  {
    ssr: false,
  },
);

export default function Page() {
  return <DocumentsOutPageClient />;
}
