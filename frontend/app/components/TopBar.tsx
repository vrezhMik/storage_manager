"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ChevronLeftIcon from "../UI/ChevronLeftIcon";
import KeyIcon from "../UI/KeyIcon";
import LogoutIcon from "../UI/LogoutIcon";
import { apiLogout } from "../lib/auth";

function titleForPath(pathname: string) {
  if (pathname.startsWith("/documents/in")) return "Մուտքեր";
  if (pathname.startsWith("/documents/out")) return "Ելքեր";
  if (pathname.startsWith("/password")) return "Գաղտնաբառ";
  if (pathname === "/") return "Գլխավոր էջ";
  return "Flexit տերմինալ";
}

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const hideHeader =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth");

  if (hideHeader) return null;

  const showBack = pathname !== "/";
  const title = titleForPath(pathname);

  const handleLogout = () => {
    apiLogout().finally(() => router.replace("/login"));
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => router.back()}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/password"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
          >
            <KeyIcon className="h-4 w-4" />
          </Link>
          <button
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
            onClick={handleLogout}
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
