import { API_BASE, authFetch } from "../lib/auth";
import { fetchDeviceReport } from "../lib/device";

// The Sales product picker's data: the catalog comes from the company's shop
// site through the server (GET /sales/catalog), the stock of the shown products
// from 1C (GET /sales/stock?codes=…, from the device for network-restricted users).

export type CatalogGroup = { id: number; name: string; parent: number | null };
export type CatalogItem = {
  code: string;
  name: string;
  price: number | null;
  image: string | null;
  // A bigger picture for zooming in (catalogs read before it existed lack it).
  imageLarge?: string | null;
  groups: number[];
};
export type Catalog = { updatedAt: string; groups: CatalogGroup[]; items: CatalogItem[] };
export type StockInfo = { stock: number | null; unit: string | null; classifierCode: string | null };

let catalog: Promise<Catalog> | null = null;

// Read once per visit; "refresh" asks the server to read the site again.
export const loadCatalog = (refresh = false): Promise<Catalog> => {
  if (!catalog || refresh) {
    const promise = authFetch<Catalog>(`${API_BASE}/sales/catalog${refresh ? "?refresh=1" : ""}`);
    promise.catch(() => {
      if (catalog === promise) catalog = null;
    });
    catalog = promise;
  }
  return catalog;
};

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const pick = (row: Raw, keys: string[]) => {
  const key = keys.find((k) => k in row && row[k] !== null && row[k] !== "");
  return key ? row[key] : undefined;
};
const toNumber = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return v === undefined || !Number.isFinite(n) ? null : n;
};

export type Partner = { tin: string; name: string; address: string };

let partners: Promise<Partner[]> | null = null;

// 1C answers [{TIN, Name, Address}]; read once per visit.
export const loadPartners = (): Promise<Partner[]> => {
  if (!partners) {
    const promise = fetchDeviceReport<unknown>("sales/partners").then((raw) =>
      (Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.Items) ? raw.Items : [])
        .filter(isRecord)
        .map((row) => ({
          tin: String(pick(row, ["TIN", "ИНН"]) ?? "").replace(/\D/g, ""),
          name: String(pick(row, ["Name", "Наименование"]) ?? "").trim(),
          address: String(pick(row, ["Address", "Адрес"]) ?? "").trim(),
        }))
        .filter((p) => p.name || p.tin),
    );
    promise.catch(() => {
      if (partners === promise) partners = null;
    });
    partners = promise;
  }
  return partners;
};

// 1C answers [{Code, Stock, Unit, ClassifierCode}] (Russian names are accepted too).
export const loadStock = async (codes: string[]): Promise<Record<string, StockInfo>> => {
  const raw = await fetchDeviceReport<unknown>(`sales/stock?codes=${encodeURIComponent(codes.join(","))}`);
  const rows = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.Items) ? raw.Items : [];
  const out: Record<string, StockInfo> = {};
  rows.filter(isRecord).forEach((row) => {
    const code = String(pick(row, ["Code", "Код"]) ?? "").trim();
    if (!code) return;
    const unit = pick(row, ["Unit", "ЕдиницаИзмерения", "Единица"]);
    const classifier = pick(row, ["ClassifierCode", "ТНВЭД", "КодТНВЭД"]);
    out[code] = {
      stock: toNumber(pick(row, ["Stock", "Остаток"])),
      unit: unit === undefined ? null : String(unit),
      classifierCode: classifier === undefined ? null : String(classifier).replace(/\s/g, ""),
    };
  });
  // Codes 1C did not return have no stock rather than an unknown one.
  codes.forEach((code) => {
    out[code] ??= { stock: 0, unit: null, classifierCode: null };
  });
  return out;
};
