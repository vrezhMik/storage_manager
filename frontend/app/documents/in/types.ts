export type PurchaseDoc = {
  id: string;
  date: string;
  transactionDate?: string;
  title: string;
  clientId?: string;
  items?: any[];
};

export const mapPurchaseDocId = (doc: any, idx: number) =>
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
