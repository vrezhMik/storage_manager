export type OrderDoc = {
  id: string;
  date: string;
  transactionDate?: string;
  title: string;
  clientId?: string;
  items?: any[];
};

export const mapOrderDocId = (doc: any, idx: number) =>
  String(
    doc?.Number ??
      doc?.DocEntry ??
      doc?.DocumentID ??
      doc?.DocumentId ??
      doc?.ID ??
      doc?.Id ??
      doc?.DocNum ??
      doc?.Guid ??
      idx
  );
