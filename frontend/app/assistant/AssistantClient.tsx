"use client";

import { useEffect, useRef, useState } from "react";
import AuthGuard from "../components/AuthGuard";
import { API_BASE, authFetch } from "../lib/auth";

export type AssistantResult = {
  score: number;
  heading: string | null;
  content: string;
  source: { id: number; title: string; type: "url" | "file"; url: string | null };
};

export type AssistantResponse = { question: string; results: AssistantResult[] };

const EXAMPLES = [
  "Ինչպե՞ս նայել վաճառքի հաշվետվությունը ըստ գործընկերների",
  "Ինչպե՞ս ձևակերպել ապրանքի վերադարձը",
  "Որտե՞ղ տեսնել մնացորդները ըստ պահեստների",
];

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";
const COLLAPSED_CHARS = 420;

function ResultCard({ result, rank }: { result: AssistantResult; rank: number }) {
  const [open, setOpen] = useState(false);
  const long = result.content.length > COLLAPSED_CHARS;
  const text = open || !long ? result.content : `${result.content.slice(0, COLLAPSED_CHARS).trimEnd()}…`;
  const relevance = Math.max(0, Math.min(100, Math.round(result.score * 100)));

  return (
    <article className={`${cardClass} space-y-2`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {rank}. {result.source.title}
          </div>
          {result.heading && <h3 className="font-semibold text-foreground break-words">{result.heading}</h3>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            relevance >= 60 ? "bg-green-100 text-green-800" : relevance >= 45 ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"
          }`}
          title="Որքանով է հատվածը համապատասխանում հարցին"
        >
          {relevance}%
        </span>
      </div>
      <p className="whitespace-pre-line text-sm text-foreground break-words">{text}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {long && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="font-medium text-primary hover:underline">
            {open ? "Ավելի քիչ" : "Կարդալ ամբողջը"}
          </button>
        )}
        {result.source.url && (
          <a
            href={result.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline break-all"
          >
            🔗 Բացել աղբյուրը
          </a>
        )}
      </div>
    </article>
  );
}

type ViewProps = {
  onAsk: (question: string) => void;
  response: AssistantResponse | null;
  loading: boolean;
  error: string | null;
  history: string[];
};

// Presentation only, so it can be rendered without the API.
export function AssistantView({ onAsk, response, loading, error, history }: ViewProps) {
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = (text: string) => {
    const q = text.trim();
    if (q.length < 3 || loading) return;
    setQuestion(q);
    onAsk(q);
  };

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} space-y-3`}>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">AI Օգնական</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">թեստային</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Տվեք հարց հայերեն կամ ռուսերեն. օգնականը կգտնի պատասխանը բեռնված ուղեցույցներում և ցույց կտա աղբյուրը։
            </p>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(question);
              }}
            >
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(question);
                  }
                }}
                rows={3}
                maxLength={1000}
                placeholder="Օրինակ՝ ինչպե՞ս նայել վաճառքի հաշվետվությունը ըստ գործընկերների"
                className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Enter՝ ուղարկել, Shift+Enter՝ նոր տող</span>
                <button
                  type="submit"
                  disabled={loading || question.trim().length < 3}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "Որոնում..." : "Հարցնել"}
                </button>
              </div>
            </form>
            {!response && !loading && (
              <div className="flex flex-wrap gap-2">
                {(history.length > 0 ? history : EXAMPLES).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => submit(q)}
                    className="rounded-full border border-input px-3 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : loading ? (
            <div className={`${cardClass} space-y-2`}>
              <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
              <div className="h-4 w-full rounded bg-muted animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            </div>
          ) : response ? (
            response.results.length === 0 ? (
              <div className={cardClass}>
                <p className="text-sm text-muted-foreground">
                  Պատասխան չգտնվեց։ Փորձեք ձևակերպել այլ կերպ, կամ ադմինկայում ավելացրեք համապատասխան ուղեցույց։
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ամենահամապատասխան հատվածները «{response.question}» հարցի համար.
                </p>
                {response.results.map((result, idx) => (
                  <ResultCard key={`${result.source.id}-${idx}`} result={result} rank={idx + 1} />
                ))}
              </div>
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function AssistantClient() {
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const ask = async (question: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setHistory((prev) => [question, ...prev.filter((q) => q !== question)].slice(0, 5));
    try {
      const data = await authFetch<AssistantResponse>(`${API_BASE}/assistant/search`, {
        method: "POST",
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setResponse(data ?? { question, results: [] });
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === "AbortError") return;
      console.error("Assistant search failed", err);
      setError(
        String(err?.message ?? "").includes("503")
          ? "AI ծառայությունը հիմա հասանելի չէ։ Փորձեք մի փոքր ուշ։"
          : "Չհաջողվեց ստանալ պատասխանը",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <AuthGuard section="assistant">
      <AssistantView onAsk={ask} response={response} loading={loading} error={error} history={history} />
    </AuthGuard>
  );
}
