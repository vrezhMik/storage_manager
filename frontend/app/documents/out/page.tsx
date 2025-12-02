"use client";

import { useRouter } from "next/navigation";
import ArrowDownToLineIcon from "../../UI/ArrowDownToLineIcon";
import ArrowUpFromLineIcon from "../../UI/ArrowUpFromLineIcon";
import ChevronLeftIcon from "../../UI/ChevronLeftIcon";
import ChevronRightIcon from "../../UI/ChevronRightIcon";
import KeyIcon from "../../UI/KeyIcon";
import LogoutIcon from "../../UI/LogoutIcon";

const docs = [
  {
    id: "001234",
    date: "15.05.2024",
    title: "ՀՀ Առողջապահության նախարարություն",
  },
  {
    id: "001235",
    date: "16.05.2024",
    title: "Արմենիա ՍՊԸ",
  },
  {
    id: "001236",
    date: "17.05.2024",
    title: "Սիլ-Կո ՌՓԲԸ",
  },
];

export default function DocumentsOutPage() {
  const router = useRouter();

  return (
    <div className="App">
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/documents")}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold text-foreground">Ելքեր</h1>
            </div>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0">
                <KeyIcon className="h-4 w-4" />
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md text-xs h-9 w-9 p-0"
                onClick={() => router.push("/login")}
              >
                <LogoutIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="space-y-3">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="rounded-xl border bg-card text-card-foreground shadow cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/documents/out/${doc.id}`)}
                role="button"
                tabIndex={0}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-baseline gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-foreground">
                          № {doc.id}
                        </h3>
                        <span className="text-sm text-muted-foreground">
                          {doc.date}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {doc.title}
                      </p>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
      <section
        aria-label="Notifications alt+T"
        tabIndex={-1}
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
      ></section>
    </div>
  );
}
