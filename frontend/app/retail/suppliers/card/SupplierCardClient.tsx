"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthGuard from "../../../components/AuthGuard";
import { loadErrorText } from "../../../lib/auth";
import { formatDisplayDate } from "../../../reports/components/DateRangeModal";
import { formatAmount, tdClass, thClass } from "../../../reports/sales/salesData";
import { LateBadge } from "../SuppliersClient";
import { buildSuppliers, DEFAULT_DAYS, isLate, loadSuppliers, oneDecimal, SuppliersData, todayIso } from "../suppliersData";

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-5";
const TOP_ITEMS = 10;
const MONTHS = ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս", "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"];

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-foreground break-words">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function SupplierCardView({ name, date, data, error }: { name: string; date: string; data: SuppliersData | null; error: string | null }) {
  const supplier = useMemo(
    () => (data ? buildSuppliers(data, date).find((s) => s.name === name) ?? null : null),
    [data, date, name],
  );
  const monthLabel = MONTHS[Number(date.slice(5, 7)) - 1];

  return (
    <div className="App">
      <main className="container mx-auto px-4 py-6 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} space-y-1`}>
            <Link href={`/retail/suppliers/?date=${date}` as Route} className="text-xs font-medium text-primary hover:underline">
              ← Մատակարարներ
            </Link>
            <h2 className="text-xl font-semibold text-foreground break-words">{name}</h2>
            <p className="text-sm text-muted-foreground">
              Վերջին {DEFAULT_DAYS} օրվա մուտքերով · {formatDisplayDate(date)} դրությամբ
            </p>
          </div>

          {error ? (
            <div className={cardClass}>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : !data ? (
            <div className={`${cardClass} space-y-2`}>
              <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          ) : !supplier ? (
            <div className={cardClass}>
              <p className="text-sm text-muted-foreground">Այս մատակարարից վերջին {DEFAULT_DAYS} օրում մուտքեր չկան</p>
            </div>
          ) : (
            <>
              {isLate(supplier) && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                  ⚠ Սովորաբար բերում է {oneDecimal(supplier.avgInterval!)} օրը մեկ։ Պետք է բերեր{" "}
                  <b>{formatDisplayDate(supplier.expectedDate!)}</b>, ուշանում է <b>{supplier.lateDays} օր</b>։
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Միջինը ամսական" value={`${oneDecimal(supplier.perMonth)} մատակարարում`} hint={`${supplier.deliveries.length} մատակարարում ${DEFAULT_DAYS} օրում`} />
                <Stat label="Ռիթմ" value={supplier.avgInterval !== null ? `${oneDecimal(supplier.avgInterval)} օրը մեկ` : "—"} hint={supplier.avgInterval === null ? "Միջինի համար քիչ տվյալ" : undefined} />
                <Stat label="Վերջին մատակարարում" value={formatDisplayDate(supplier.lastDate)} />
                <Stat
                  label="Սպասվող մատակարարում"
                  value={supplier.expectedDate ? formatDisplayDate(supplier.expectedDate) : "—"}
                  hint={<LateBadge supplier={supplier} />}
                />
              </div>

              <div className={`${cardClass} space-y-2`}>
                <h3 className="font-semibold text-foreground">Այս ամիս ({monthLabel}) բերել է</h3>
                {supplier.thisMonth.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Այս ամիս մատակարարում դեռ չի եղել</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {supplier.thisMonth.map((d) => (
                      <span key={d.date} className="rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
                        <b>{formatDisplayDate(d.date).slice(0, 5)}</b>
                        <span className="ml-2 tabular-nums text-muted-foreground">{formatAmount(d.sum)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${cardClass} space-y-3`}>
                <h3 className="font-semibold text-foreground">Թոփ {TOP_ITEMS} ապրանք</h3>
                {supplier.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ապրանքներ չկան</p>
                ) : (
                  <>
                    <ol className="space-y-2 md:hidden">
                      {supplier.items.slice(0, TOP_ITEMS).map((item, i) => (
                        <li key={item.name} className="rounded-lg border border-border px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words">
                              <span className="text-muted-foreground">{i + 1}.</span> {item.name}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">{formatAmount(item.sum)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">Քանակ՝ {formatAmount(item.qty)}</div>
                        </li>
                      ))}
                    </ol>
                    <div className="hidden md:block overflow-x-auto -mx-5 px-5">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr>
                            <th className={`${thClass} text-right`}>#</th>
                            <th className={`${thClass} text-left`}>Ապրանք</th>
                            <th className={`${thClass} text-right`}>Քանակ</th>
                            <th className={`${thClass} text-right`}>Գումար</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplier.items.slice(0, TOP_ITEMS).map((item, i) => (
                            <tr key={item.name}>
                              <td className={`${tdClass} text-muted-foreground`}>{i + 1}</td>
                              <td className={`${tdClass} text-left whitespace-normal min-w-[14rem]`}>{item.name}</td>
                              <td className={tdClass}>{formatAmount(item.qty)}</td>
                              <td className={`${tdClass} font-semibold`}>{formatAmount(item.sum)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className={`${cardClass} space-y-2`}>
                <h3 className="font-semibold text-foreground">Վերջին մատակարարումները</h3>
                <ul className="divide-y divide-border text-sm">
                  {[...supplier.deliveries].reverse().slice(0, 10).map((d) => (
                    <li key={d.date} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                      <span>
                        {formatDisplayDate(d.date)}
                        {d.docs.length > 0 && <span className="ml-2 text-xs text-muted-foreground">№ {d.docs.join(", ")}</span>}
                      </span>
                      <span className="font-semibold tabular-nums">{formatAmount(d.sum)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SupplierCardClient() {
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : todayIso();
  const [data, setData] = useState<SuppliersData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    loadSuppliers(date)
      .then((d) => alive && setData(d))
      .catch((err) => {
        console.error("Supplier card failed", err);
        if (alive) setError(loadErrorText(err));
      });
    return () => {
      alive = false;
    };
  }, [date]);

  return (
    <AuthGuard section="retail">
      <SupplierCardView name={name} date={date} data={data} error={error} />
    </AuthGuard>
  );
}
