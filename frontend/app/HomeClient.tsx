"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import KeyIcon from "./UI/KeyIcon";
import LogoutIcon from "./UI/LogoutIcon";
import ArrowDownToLineIcon from "./UI/ArrowDownToLineIcon";
import ArrowUpFromLineIcon from "./UI/ArrowUpFromLineIcon";
import AuthGuard from "./components/AuthGuard";
import { apiLogout } from "./lib/auth";

export default function HomeClient() {
  const router = useRouter();

  const handleLogout = () => {
    apiLogout().finally(() => router.replace("/login"));
  };

  return (
    <AuthGuard>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">
                Բարի գալուստ <span className="text-[#cfb40b] text-4">Flexit</span> տերմինալ
              </h2>
              <p className="text-muted-foreground">Ընտրեք գործողություն</p>
            </div>
            <div className="grid gap-4">
              <Link
                href="/documents/in"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground px-4 py-2 h-20 text-lg font-medium"
              >
                <ArrowDownToLineIcon className="mr-2 h-6 w-6" />
                Մուտքեր
              </Link>
              <Link
                href="/documents/out"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-20 text-lg font-medium"
              >
                <ArrowUpFromLineIcon className="mr-2 h-6 w-6" />
                Ելքեր
              </Link>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
