"use client";

import GroupedSalesTable from "../components/GroupedSalesTable";
import SalesReportPage from "../components/SalesReportPage";
import { salesByWarehouseHref } from "../links";
import { extractSaleRows, rowWarehouse } from "../sales/salesData";

export default function SalesByWarehousePageClient() {
  return (
    <SalesReportPage
      title="Վաճառք ըստ պահեստների"
      apiPath="sales-by-warehouse"
      extractRows={extractSaleRows}
      hrefFor={salesByWarehouseHref}
      renderRows={(rows) => (
        <GroupedSalesTable rows={rows} groupOf={rowWarehouse} groupHeader="Պահեստ / Գործընկեր" title="Վաճառք ըստ պահեստների" />
      )}
    />
  );
}
