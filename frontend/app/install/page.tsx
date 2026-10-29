import dynamic from "next/dynamic";

const InstallClient = dynamic(() => import("./InstallClient"), {
  ssr: false,
});

export default function Page() {
  return <InstallClient />;
}
