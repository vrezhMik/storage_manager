import dynamic from "next/dynamic";

const PasswordClient = dynamic(() => import("./PasswordClient"), {
  ssr: false,
});

export default function Page() {
  return <PasswordClient />;
}
