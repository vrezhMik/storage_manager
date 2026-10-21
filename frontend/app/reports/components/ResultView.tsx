// The 1C response shape for reports is not fixed yet, so render whatever comes back:
// a list of records, a single record, or a plain value.
export default function ResultView({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-muted-foreground">Տվյալներ չկան</p>;
    }
    return (
      <div className="space-y-2">
        {value.map((entry, idx) => (
          <div key={idx} className="rounded-md border border-border p-3">
            <ResultView value={entry} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
        {Object.entries(value as Record<string, unknown>).map(([key, v]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="font-medium text-foreground break-words">
              <ResultView value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}
