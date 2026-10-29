"use client";

import { ComponentType, SVGProps, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "../components/AuthGuard";
import WalletIcon from "../UI/WalletIcon";
import ClockIcon from "../UI/ClockIcon";
import ShoppingCartIcon from "../UI/ShoppingCartIcon";
import WarehouseIcon from "../UI/WarehouseIcon";
import TrendIcon from "../UI/TrendIcon";
import SnowflakeIcon from "../UI/SnowflakeIcon";
import TrophyIcon from "../UI/TrophyIcon";
import UsersIcon from "../UI/UsersIcon";
import DateRangeModal, { DateRange } from "./components/DateRangeModal";
import { abcHref, debtsHref, salesByWarehouseHref, salesHref } from "./links";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Reports either ask for a date range first (hrefFor) or pick their own
// filters on the page (href).
type Report = { title: string; Icon: Icon } & (
  | { hrefFor: (range: DateRange) => Route }
  | { href: Route }
);

const REPORTS: Report[] = [
  { title: "Պարտքեր", Icon: WalletIcon, hrefFor: debtsHref },
  { title: "Ժամկետանց պարտքեր", Icon: ClockIcon, href: "/reports/overdue-debts" },
  { title: "Վաճառք ըստ մենեջերների", Icon: ShoppingCartIcon, hrefFor: salesHref },
  { title: "Վաճառք ըստ պահեստների", Icon: WarehouseIcon, hrefFor: salesByWarehouseHref },
  { title: "Վաճառքի դինամիկա", Icon: TrendIcon, href: "/reports/sales-monthly" },
  { title: "Սառեցված մնացորդ", Icon: SnowflakeIcon, href: "/reports/frozen-stock" },
  { title: "Թոփ ապրանքներ (ABC)", Icon: TrophyIcon, hrefFor: abcHref },
  { title: "Հաճախորդներ", Icon: UsersIcon, href: "/reports/customers" },
];

const buttonClass =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 px-4 py-2 h-20 text-lg font-medium";
const outlineClass = "border border-input shadow-sm hover:bg-accent hover:text-accent-foreground";
const primaryClass = "bg-primary text-primary-foreground shadow hover:bg-primary/90";

export default function ReportsPageClient() {
  const router = useRouter();
  const [modalReport, setModalReport] = useState<Report | null>(null);

  return (
    <AuthGuard section="reports">
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Հաշվետվություններ</h2>
              <p className="text-muted-foreground">Ընտրեք հաշվետվությունը</p>
            </div>
            <div className="grid gap-4">
              {REPORTS.map((report, idx) => {
                const className = `${buttonClass} ${idx % 2 === 0 ? outlineClass : primaryClass}`;
                const content = (
                  <>
                    <report.Icon className="mr-2 h-6 w-6" />
                    {report.title}
                  </>
                );
                return "href" in report ? (
                  <Link key={report.title} href={report.href} className={className}>
                    {content}
                  </Link>
                ) : (
                  <button
                    key={report.title}
                    type="button"
                    onClick={() => setModalReport(report)}
                    className={className}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
      <DateRangeModal
        open={modalReport !== null}
        title={modalReport?.title ?? ""}
        onClose={() => setModalReport(null)}
        onSubmit={(range) => {
          if (!modalReport || !("hrefFor" in modalReport)) return;
          const href = modalReport.hrefFor(range);
          setModalReport(null);
          router.push(href);
        }}
      />
    </AuthGuard>
  );
}
