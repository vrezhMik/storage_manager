import dynamic from "next/dynamic";

const DocumentsInPageClient = dynamic(
  () => import("./DocumentsInPageClient"),
  {
    ssr: false,
  },
);


export default function Page() {
  return <DocumentsInPageClient />;
}
