import ClientPage from "./ClientPage";

export function generateStaticParams() {
  return [];
}

export default function Page({ params }: { params: { id: string } }) {
  return <ClientPage params={params} />;
}
