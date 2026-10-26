import dynamic from "next/dynamic";

const AbcPageClient = dynamic(() => import("./AbcPageClient"), {
  ssr: false,
});

export default function Page() {
  return <AbcPageClient />;
}
