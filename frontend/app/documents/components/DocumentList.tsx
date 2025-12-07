"use client";

import ChevronRightIcon from "../../UI/ChevronRightIcon";

type Document = {
  id: string;
  date: string;
  title: string;
};

type Props = {
  documents: Document[];
  onSelect: (id: string) => void;
  loading?: boolean;
  skeletonCount?: number;
};

export default function DocumentList({
  documents,
  onSelect,
  loading = false,
  skeletonCount = 3,
}: Props) {
  return (
    <div className="space-y-3">
      {loading &&
        Array.from({ length: skeletonCount }).map((_, idx) => (
          <div
            key={`skeleton-${idx}`}
            className="relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow backdrop-blur-sm animate-pulse"
          >
            <div className="relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow backdrop-blur-sm animate-pulse">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-70" />
              <div className="p-4 space-y-4 relative">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-24 rounded bg-muted-foreground/25 blur-[0.3px] bg-primary" />
                    <div className="h-4 w-16 rounded bg-muted-foreground/20 blur-[0.3px] bg-primary" />
                  </div>
                  <div className="h-6 w-6 rounded-full bg-muted-foreground/20 blur-[0.3px] bg-primary" />
                </div>
                <div className="h-4 w-3/4 rounded bg-muted-foreground/15 blur-[0.4px] bg-primary" />
              </div>
            </div>
          </div>
        ))}
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="rounded-xl border bg-card text-card-foreground shadow cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSelect(doc.id)}
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
                <p className="text-sm text-muted-foreground">{doc.title}</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
