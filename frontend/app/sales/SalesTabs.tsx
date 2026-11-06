import type { Route } from "next";
import Link from "next/link";

// Switches "Վաճառքներ" between account documents and cash register receipts.
const TABS = [
  { key: "docs", href: "/sales", label: "Հաշիվ-վավերագրեր" },
  { key: "hdm", href: "/sales/hdm", label: "ՀԴՄ կտրոններ" },
] as const;

export default function SalesTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex gap-1 rounded-xl border bg-card p-1 text-sm shadow">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href as Route}
          className={`flex-1 rounded-lg px-3 py-2 text-center font-medium ${
            tab.key === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
