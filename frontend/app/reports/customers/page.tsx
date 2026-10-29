import dynamic from "next/dynamic";

const CustomersClient = dynamic(() => import("./CustomersClient"), {
  ssr: false,
});

export default function Page() {
  return <CustomersClient />;
}
