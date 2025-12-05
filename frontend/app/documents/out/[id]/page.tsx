import ClientPage from "./ClientPage";

export function generateStaticParams() {
  return [];
}

export const dynamicParams = true;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page({ params }: { params: { id: string } }) {
  return <ClientPage params={params} />;
}
