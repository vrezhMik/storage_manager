"use client";

import AuthGuard from "../../components/AuthGuard";

export default function ReportPlaceholder({ title }: { title: string }) {
  return (
    <AuthGuard>
      <div className="App">
        <main className="container mx-auto px-4 py-6 pb-20">
          <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">{title}</h2>
            <p className="text-muted-foreground">Բաժինը մշակման փուլում է</p>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
