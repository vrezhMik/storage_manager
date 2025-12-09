import ClientPage from "../[id]/ClientPage";

type SearchParams = { id?: string | string[] };

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const idParam = searchParams?.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return <ClientPage id={id} />;
}
