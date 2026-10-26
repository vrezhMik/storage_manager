import type { Route } from "next";
import type { DateRange } from "./components/DateRangeModal";

export const salesHref = ({ start, end }: DateRange) =>
  `/reports/sales/?start=${start}&end=${end}` as Route;

export const abcHref = ({ start, end }: DateRange) =>
  `/reports/abc/?start=${start}&end=${end}` as Route;

export const debtsHref =({ start, end }: DateRange) =>
  `/reports/debts/?start=${start}&end=${end}` as Route;

export const salesByWarehouseHref =({ start, end }: DateRange) =>
  `/reports/sales-by-warehouse/?start=${start}&end=${end}` as Route;
