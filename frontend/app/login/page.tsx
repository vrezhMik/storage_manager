"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, storeAuthTokens, clearAuthStorage } from "../lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
  "http://127.0.0.1:8000/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/");
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.message || "Չհաջողվեց մուտք գործել");
        return;
      }

      clearAuthStorage();
      storeAuthTokens(data);

      router.push("/");
    } catch (err) {
      setError("Կապի սխալ, փորձեք կրկին");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="rounded-xl border bg-card text-card-foreground w-full max-w-md shadow-lg">
          <div className="flex flex-col p-6 space-y-3 text-center">
            <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-package h-8 w-8 text-primary-foreground"
                aria-hidden="true"
              >
                <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"></path>
                <path d="M12 22V12"></path>
                <polyline points="3.29 7 12 12 20.71 7"></polyline>
                <path d="m7.5 4.27 9 5.15"></path>
              </svg>
            </div>
            <div className="tracking-tight text-2xl font-bold">
              Պահեստի կառավարում
            </div>
            <div className="text-muted-foreground text-base">
              Մուտք գործեք ձեր հաշիվ
            </div>
          </div>
          <div className="p-6 pt-0">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium leading-none"
                  htmlFor="email"
                >
                  Էլ. հասցե
                </label>
                <input
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-11"
                  id="email"
                  placeholder="Մուտքագրեք էլ. հասցեն"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium leading-none"
                  htmlFor="password"
                >
                  Գաղտնաբառ
                </label>
                <div className="relative">
                  <input
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 pr-24 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-11"
                    id="password"
                    placeholder="Մուտքագրեք գաղտնաբառը"
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-2 my-1 inline-flex items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={loading}
                  >
                    {showPassword ? "Թաքցնել" : "Ցույց տալ"}
                  </button>
                </div>
              </div>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
              <button
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 w-full h-11 text-base"
                type="submit"
                disabled={loading}
              >
                {loading ? "Մուտք..." : "Մուտք"}
              </button>
            </form>
          </div>
        </div>
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
