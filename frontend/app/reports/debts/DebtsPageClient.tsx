"use client";

import SalesReportPage from "../components/SalesReportPage";
import { debtsHref } from "../links";
import DebtsTable, { extractDebtRows } from "./DebtsTable";

export default function DebtsPageClient() {
  return (
    <SalesReportPage
      title="Պարտքեր"
      apiPath="debts"
      extractRows={extractDebtRows}
      hrefFor={debtsHref}
      renderRows={(rows, range) => <DebtsTable rows={rows} range={range} />}
    />
  );
}
