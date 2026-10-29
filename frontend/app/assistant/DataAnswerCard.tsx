"use client";

import type { Route } from "next";
import Link from "next/link";
import type { DataAnswer } from "./dataAnswers";

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";

export default function DataAnswerCard({
  answer,
  onSearchKb,
}: {
  answer: DataAnswer;
  onSearchKb: () => void;
}) {
  const max = Math.max(...answer.rows.map((r) => Math.abs(r.amount ?? 0)), 1);
  const numbered = answer.ranked !== false && answer.rows.length > 1;

  return (
    <article className={`${cardClass} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-foreground break-words">{answer.title}</h3>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          1C տվյալներ
        </span>
      </div>
      <p className="text-sm text-foreground">{answer.sentence}</p>

      {answer.rows.length > 0 && (
        <ol className="space-y-2">
          {answer.rows.map((row, idx) => {
            const name = row.href ? (
              <Link href={row.href as Route} className="text-primary hover:underline">
                {row.name}
              </Link>
            ) : (
              row.name
            );
            return (
              <li key={`${row.name}-${idx}`} className="space-y-1">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">
                    {numbered && <span className="mr-1 text-muted-foreground">{idx + 1}.</span>}
                    {name}
                    {row.hint && <span className="ml-2 text-xs text-muted-foreground">{row.hint}</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{row.value}</span>
                </div>
                {row.amount !== undefined && numbered && (
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.max((Math.abs(row.amount) / max) * 100, 2)}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {answer.note && <p className="text-xs text-muted-foreground">{answer.note}</p>}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {answer.link && (
          <Link href={answer.link.href as Route} className="font-medium text-primary hover:underline">
            {answer.link.label} →
          </Link>
        )}
        <button
          type="button"
          onClick={onSearchKb}
          className="font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Որոնել գիտելիքների բազայում
        </button>
      </div>
    </article>
  );
}
