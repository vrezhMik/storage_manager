import type { Route } from "next";
import type { DateRange } from "./components/DateRangeModal";

export const salesHref = ({ start, end }: DateRange) =>
  `/reports/sales/?start=${start}&end=${end}` as Route;
