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
};

export default function DocumentList({ documents, onSelect }: Props) {
  return (
    <div className="space-y-3">
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
                  <span className="text-sm text-muted-foreground">{doc.date}</span>
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
