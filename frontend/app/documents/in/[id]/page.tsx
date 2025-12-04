import ClientPage from "./ClientPage";
import { inDocs } from "../data";

export function generateStaticParams() {
  return inDocs.map((doc) => ({ id: doc.id }));
}

export default function Page({ params }: { params: { id: string } }) {
  return <ClientPage params={params} />;
}
