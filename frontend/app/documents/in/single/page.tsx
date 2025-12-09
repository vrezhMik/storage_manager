import dynamic from "next/dynamic";

const SingleInPageClient = dynamic(
  () => import("./SingleInPageClient"),
  {
    ssr: false,
  },
);

export default function Page() {
  return <SingleInPageClient />;
}
