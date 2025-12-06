"use client";

import AuthGuard from "../components/AuthGuard";

export default function PasswordPage() {
  return (
    <AuthGuard>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="flex flex-col space-y-1.5 p-6">
              <div className="font-semibold tracking-tight text-lg">Փոխել գաղտնաբառը</div>
            </div>
            <div className="p-6 pt-0">
              <form className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="oldPassword">
                    Հին գաղտնաբառ
                  </label>
                  <input
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-11"
                    id="oldPassword"
                    type="password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="newPassword">
                    Նոր գաղտնաբառ
                  </label>
                  <input
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-11"
                    id="newPassword"
                    type="password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="confirmPassword">
                    Հաստատել նոր գաղտնաբառը
                  </label>
                  <input
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-11"
                    id="confirmPassword"
                    type="password"
                    required
                  />
                </div>
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 w-full h-11"
                  type="submit"
                >
                  Պահպանել
                </button>
              </form>
            </div>
          </div>
        </main>
        <section
          aria-label="Notifications alt+T"
          tabIndex={-1}
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
        ></section>
      </div>
    </AuthGuard>
  );
}
