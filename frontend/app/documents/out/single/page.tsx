import dynamic from "next/dynamic";

const SingleOutPageClient = dynamic(
  () => import("./SingleOutPageClient"),
  {
    ssr: false,
  },
);

export default function Page() {
  return <SingleOutPageClient />;
}
