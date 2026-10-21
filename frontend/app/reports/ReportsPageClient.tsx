"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "../components/AuthGuard";
import WalletIcon from "../UI/WalletIcon";
import ShoppingCartIcon from "../UI/ShoppingCartIcon";
import DateRangeModal from "./components/DateRangeModal";
import { salesHref } from "./links";

export default function ReportsPageClient() {
  const router = useRouter();
  const [salesModalOpen, setSalesModalOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Հաշվետվություններ</h2>
              <p className="text-muted-foreground">Ընտրեք հաշվետվությունը</p>
            </div>
            <div className="grid gap-4">
              <Link
                href="/reports/debts"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground px-4 py-2 h-20 text-lg font-medium"
              >
                <WalletIcon className="mr-2 h-6 w-6" />
                Պարտքեր
              </Link>
              <button
                type="button"
                onClick={() => setSalesModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-20 text-lg font-medium"
              >
                <ShoppingCartIcon className="mr-2 h-6 w-6" />
                Վաճառքներ
              </button>
            </div>
          </div>
        </main>
      </div>
      <DateRangeModal
        open={salesModalOpen}
        title="Վաճառքներ"
        onClose={() => setSalesModalOpen(false)}
        onSubmit={(range) => {
          setSalesModalOpen(false);
          router.push(salesHref(range));
        }}
      />
    </AuthGuard>
  );
}
