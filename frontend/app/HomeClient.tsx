"use client";

import { ComponentType, SVGProps, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import ArrowDownToLineIcon from "./UI/ArrowDownToLineIcon";
import ArrowUpFromLineIcon from "./UI/ArrowUpFromLineIcon";
import ChartIcon from "./UI/ChartIcon";
import DashboardIcon from "./UI/DashboardIcon";
import TagIcon from "./UI/TagIcon";
import AuthGuard, { SECTIONS_CHANGED_EVENT } from "./components/AuthGuard";
import { Section, SectionAccess, getUserSections } from "./lib/auth";

const SECTION_LINKS: {
  section: Section;
  href: Route;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { section: "dashboard", href: "/dashboard", label: "Flexit Դաշբորդ", Icon: DashboardIcon },
  { section: "documents_in", href: "/documents/in", label: "Մուտքեր", Icon: ArrowDownToLineIcon },
  { section: "documents_out", href: "/documents/out", label: "Ելքեր", Icon: ArrowUpFromLineIcon },
  { section: "reports", href: "/reports", label: "Հաշվետվություններ", Icon: ChartIcon },
  { section: "price_check", href: "/price-check", label: "Գնի հարցում", Icon: TagIcon },
];

const baseLinkClass =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 px-4 py-2 h-20 text-lg font-medium";
const outlineClass = "border border-input shadow-sm hover:bg-accent hover:text-accent-foreground";
const primaryClass = "bg-primary text-primary-foreground shadow hover:bg-primary/90";

export default function HomeClient() {
  const [sections, setSections] = useState<SectionAccess>(getUserSections);

  useEffect(() => {
    const update = () => setSections(getUserSections());
    window.addEventListener(SECTIONS_CHANGED_EVENT, update);
    return () => window.removeEventListener(SECTIONS_CHANGED_EVENT, update);
  }, []);

  const visibleLinks = SECTION_LINKS.filter((link) => sections[link.section]);

  return (
    <AuthGuard>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">
                Բարի գալուստ <span className="text-[#cfb40b] text-4">Flexit</span> տերմինալ
              </h2>
              <p className="text-muted-foreground">
                {visibleLinks.length > 0
                  ? "Ընտրեք գործողություն"
                  : "Ձեզ համար հասանելի բաժիններ չկան։ Դիմեք ադմինիստրատորին։"}
              </p>
            </div>
            <div className="grid gap-4">
              {visibleLinks.map(({ section, href, label, Icon }, idx) => (
                <Link
                  key={section}
                  href={href}
                  className={`${baseLinkClass} ${idx % 2 === 0 ? outlineClass : primaryClass}`}
                >
                  <Icon className="mr-2 h-6 w-6" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
