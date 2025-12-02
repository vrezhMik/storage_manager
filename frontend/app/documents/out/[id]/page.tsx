import ClientPage from "./ClientPage";

const docs = [
  { id: "001234" },
  { id: "001235" },
  { id: "001236" },
];

export function generateStaticParams() {
  return docs;
}

export default function Page({ params }: { params: { id: string } }) {
  return <ClientPage params={params} />;
}
