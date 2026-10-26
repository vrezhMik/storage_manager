"use client";

import GroupedSalesTable from "../components/GroupedSalesTable";
import SalesReportPage from "../components/SalesReportPage";
import { salesHref } from "../links";
import { extractSaleRows, rowManager } from "./salesData";

export default function SalesPageClient() {
  return (
    <SalesReportPage
      title="Վաճառք ըստ մենեջերների"
      apiPath="sales"
      extractRows={extractSaleRows}
      hrefFor={salesHref}
      renderRows={(rows) => (
        <GroupedSalesTable rows={rows} groupOf={rowManager} groupHeader="Մենեջեր / Գործընկեր" />
      )}
    />
  );
}
