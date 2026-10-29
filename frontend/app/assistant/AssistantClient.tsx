"use client";

import { useEffect, useRef, useState } from "react";
import AuthGuard from "../components/AuthGuard";
import { API_BASE, authFetch, getUserSections } from "../lib/auth";
import DataAnswerCard from "./DataAnswerCard";
import { answerDataQuestion, DataAnswer } from "./dataAnswers";
import { DataIntent, looksLikeHowTo, parseDataQuestion } from "./dataQuestions";

export type AssistantResult = {
  score: number;
  relevant?: boolean;
  heading: string | null;
  content: string;
  // Armenian translation of content / section when the source was translated.
  content_hy?: string | null;
  // Whole section around the matching chunk (newer API); falls back to content.
  section?: string;
  section_hy?: string | null;
  source: { id: number; title: string; type: "url" | "file"; url: string | null };
};

// Pictures live in the text as their own line: [[img:relative/path.png]].
const IMAGE_MARKER = /\[\[img:([^\]\n]+)\]\]/g;

const stripImages = (text: string) => text.replace(IMAGE_MARKER, "").replace(/\n{2,}/g, "\n").trim();

const countImages = (text: string) => (text.match(IMAGE_MARKER) ?? []).length;

const imageUrl = (sourceId: number, path: string) =>
  /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE}/assistant/image/${sourceId}?path=${encodeURIComponent(path)}`;

// Text with its pictures in place; a picture that cannot be loaded is hidden.
function RichText({ text, sourceId }: { text: string; sourceId: number }) {
  const parts = text.split(/(\[\[img:[^\]\n]+\]\])/);
  return (
    <div className="space-y-2 text-sm text-foreground break-words">
      {parts.map((part, idx) => {
        const image = part.match(/^\[\[img:([^\]\n]+)\]\]$/);
        if (image) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={idx}
              src={imageUrl(sourceId, image[1])}
              alt=""
              loading="lazy"
              className="max-w-full rounded-md border border-border"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          );
        }
        const trimmed = part.replace(/^\n+|\n+$/g, "");
        return trimmed ? (
          <p key={idx} className="whitespace-pre-line">
            {trimmed}
          </p>
        ) : null;
      })}
    </div>
  );
}

export type AssistantResponse = { question: string; min_score?: number; results: AssistantResult[] };

const EXAMPLES = [
  "Ինչպե՞ս ձևակերպել ապրանքի վերադարձը",
  "Որտե՞ղ տեսնել մնացորդները ըստ պահեստների",
];

// Questions about the numbers; shown only to users who can open reports.
const DATA_EXAMPLES = [
  "Ո՞վ է այս ամիս ամենաշատը վաճառել",
  "Ո՞ր հաճախորդներն են 30 օր չեն գնել",
  "Ժամկետանց պարտքերը ըստ հաճախորդների",
];

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";
const COLLAPSED_CHARS = 420;
// Pictures shown before "Read all" is pressed.
const SNIPPET_IMAGES = 2;

function ResultCard({ result, rank }: { result: AssistantResult; rank: number }) {
  const [open, setOpen] = useState(false);
  const hasArmenian = Boolean(result.content_hy || result.section_hy);
  const [armenian, setArmenian] = useState(true);
  const showArmenian = hasArmenian && armenian;

  const content = (showArmenian ? result.content_hy : null) ?? result.content;
  const section = (showArmenian ? result.section_hy : null) ?? result.section ?? "";
  const full = section.length > content.length ? section : content;
  // Collapsed: the matching part without pictures, cut at a word boundary.
  // Open: the whole section with its pictures.
  const plain = stripImages(content);
  const snippet =
    plain.length > COLLAPSED_CHARS ? `${plain.slice(0, COLLAPSED_CHARS).replace(/\s+\S*$/, "")}…` : plain;
  const images = countImages(full);
  const snippetImages = (content.match(IMAGE_MARKER) ?? []).slice(0, SNIPPET_IMAGES);
  const long = stripImages(full).length > snippet.length || images > 0;
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
      {open ? (
        <RichText text={full} sourceId={result.source.id} />
      ) : (
        <>
          <p className="whitespace-pre-line text-sm text-foreground break-words">{snippet}</p>
          {/* Pictures of the matching part are shown right away. */}
          {snippetImages.length > 0 && (
            <RichText text={snippetImages.join("\n")} sourceId={result.source.id} />
          )}
        </>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {long && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="font-medium text-primary hover:underline">
            {open ? "Ավելի քիչ" : `Կարդալ ամբողջը${images > 0 ? ` · 📷 ${images}` : ""}`}
          </button>
        )}
        {hasArmenian && (
          <button
            type="button"
            onClick={() => setArmenian((v) => !v)}
            className="font-medium text-muted-foreground hover:text-foreground hover:underline"
            title="Ավտոմատ թարգմանություն. կասկածի դեպքում նայեք բնօրինակը"
          >
            {showArmenian ? "Բնօրինակ (ru)" : "Հայերեն"}
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

// Weak matches (below the server's min_score) are hidden unless asked for.
function Results({ response }: { response: AssistantResponse }) {
  const [showWeak, setShowWeak] = useState(false);
  useEffect(() => setShowWeak(false), [response]);

  const relevant = response.results.filter((r) => r.relevant !== false);
  const weak = response.results.filter((r) => r.relevant === false);
  const shown = showWeak ? response.results : relevant;

  return (
    <div className="space-y-3">
      {relevant.length === 0 ? (
        <div className={`${cardClass} space-y-2`}>
          <p className="text-sm text-foreground">Ձեր հարցի պատասխանը բազայում չգտնվեց։</p>
          <p className="text-sm text-muted-foreground">
            Փորձեք ձևակերպել այլ կերպ, կամ ադմինկայում ավելացրեք համապատասխան ուղեցույց։
          </p>
          {weak.length > 0 && !showWeak && (
            <button
              type="button"
              onClick={() => setShowWeak(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ցույց տալ մոտավոր արդյունքները ({weak.length})
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ամենահամապատասխան հատվածները «{response.question}» հարցի համար.
        </p>
      )}
      {shown.map((result, idx) => (
        <ResultCard key={`${result.source.id}-${idx}`} result={result} rank={idx + 1} />
      ))}
      {relevant.length > 0 && weak.length > 0 && !showWeak && (
        <button
          type="button"
          onClick={() => setShowWeak(true)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Ցույց տալ նաև թույլ համապատասխանությունները ({weak.length})
        </button>
      )}
    </div>
  );
}

type ViewProps = {
  onAsk: (question: string, knowledgeBaseOnly?: boolean) => void;
  response: AssistantResponse | null;
  dataAnswer?: DataAnswer | null;
  loading: boolean;
  error: string | null;
  history: string[];
  examples?: string[];
};

// Presentation only, so it can be rendered without the API.
export function AssistantView({ onAsk, response, dataAnswer, loading, error, history, examples = EXAMPLES }: ViewProps) {
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
            <h2 className="text-xl font-semibold text-foreground">Flexik օգնական</h2>
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
            {!response && !dataAnswer && !loading && (
              <div className="flex flex-wrap gap-2">
                {(history.length > 0 ? history : examples).map((q) => (
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
          ) : dataAnswer ? (
            <DataAnswerCard answer={dataAnswer} onSearchKb={() => onAsk(question, true)} />
          ) : response ? (
            <Results response={response} />
          ) : null}
        </div>
      </main>
    </div>
  );
}

// A data question goes to 1C: the built-in rules read it first (fast, no
// server load); otherwise the server's chat model, when one is set up,
// decides whether it is about the numbers. Everything else is searched in
// the knowledge base.
const readIntent = async (question: string, signal: AbortSignal): Promise<DataIntent | null> => {
  const local = parseDataQuestion(question);
  if (local) return local;
  if (looksLikeHowTo(question)) return null;
  try {
    const res = await authFetch<{ engine?: string; intent?: DataIntent | null }>(`${API_BASE}/assistant/intent`, {
      method: "POST",
      body: JSON.stringify({ question }),
      signal,
    });
    return res?.intent && res.intent.topic !== "none" ? res.intent : null;
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    // An older backend without /assistant/intent: just search the knowledge base.
    return null;
  }
};

export default function AssistantClient() {
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [dataAnswer, setDataAnswer] = useState<DataAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const [canSeeData] = useState(() => getUserSections().reports);

  useEffect(() => () => requestRef.current?.abort(), []);

  const ask = async (question: string, knowledgeBaseOnly = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setHistory((prev) => [question, ...prev.filter((q) => q !== question)].slice(0, 5));
    try {
      if (canSeeData && !knowledgeBaseOnly) {
        const intent = await readIntent(question, controller.signal);
        const answer = intent ? await answerDataQuestion(intent, question) : null;
        if (controller.signal.aborted) return;
        if (answer) {
          setResponse(null);
          setDataAnswer(answer);
          return;
        }
      }
      const data = await authFetch<AssistantResponse>(`${API_BASE}/assistant/search`, {
        method: "POST",
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setDataAnswer(null);
        setResponse(data ?? { question, results: [] });
      }
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === "AbortError") return;
      console.error("Assistant failed", err);
      setError(
        String(err?.message ?? "").includes("503")
          ? "Օգնականը հիմա հասանելի չէ։ Փորձեք մի փոքր ուշ։"
          : "Չհաջողվեց ստանալ պատասխանը",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <AuthGuard section="assistant">
      <AssistantView
        onAsk={ask}
        response={response}
        dataAnswer={dataAnswer}
        loading={loading}
        error={error}
        history={history}
        examples={canSeeData ? [...DATA_EXAMPLES, ...EXAMPLES] : EXAMPLES}
      />
    </AuthGuard>
  );
}
