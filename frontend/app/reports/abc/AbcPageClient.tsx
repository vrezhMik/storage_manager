"use client";

import SalesReportPage from "../components/SalesReportPage";
import { abcHref } from "../links";
import AbcTable, { extractAbcRows } from "./AbcTable";

export default function AbcPageClient() {
  return (
    <SalesReportPage
      title="Թոփ ապրանքներ (ABC)"
      apiPath="abc"
      extractRows={extractAbcRows}
      hrefFor={abcHref}
      renderRows={(rows) => <AbcTable rows={rows} />}
    />
  );
}
