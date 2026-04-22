export const MATERIAL_CATEGORIES = [
  { id: "paint", label: "Фарба" },
  { id: "primer", label: "Ґрунт" },
  { id: "solvent", label: "Розчинник" },
  { id: "profile", label: "Prof. Nostel" },
  { id: "pipe", label: "Труба" },
  { id: "fastener", label: "Кріплення" },
  { id: "other", label: "Інше" },
] as const;

export type MaterialCategoryId = (typeof MATERIAL_CATEGORIES)[number]["id"];

const LEGACY_LABELS: Record<string, string> = {
  metal: "Профіль / метал",
};

export function materialCategoryLabel(id: string): string {
  return (
    MATERIAL_CATEGORIES.find((c) => c.id === id)?.label ?? LEGACY_LABELS[id] ?? id
  );
}

export function isPaintLikeCategory(id: string): boolean {
  return id === "paint" || id === "primer" || id === "solvent";
}

/** Категорія «Prof. Nostel» (профнастил тощо) — висота, товщина, глянець/мат */
export function isProfNostelCategory(id: string): boolean {
  return id === "profile";
}

/** Труба — номер, розміри, товщина стінки */
export function isPipeCategory(id: string): boolean {
  return id === "pipe";
}

/** Рядок з поля форми → число або null, якщо порожньо / невалідно */
export function parsePurchasePriceInput(raw: string): number | null {
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatPurchasePriceUa(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(value)} грн`;
}

/** Значення з `<input type="date">` або порожній рядок → YYYY-MM-DD або null */
export function parsePurchaseDateInput(raw: string): string | null {
  const s = String(raw).trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Дата закупівлі для списку (український формат, без зсуву часового поясу) */
export function formatPurchaseDateUa(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map((x) => Number(x));
  if (!y || !mo || !d) return null;
  const date = new Date(y, mo - 1, d);
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "long" }).format(date);
}

export const SURFACE_FINISH_OPTIONS = [
  { id: "glossy", label: "Глянець" },
  { id: "matte", label: "Мат" },
] as const;

export type SurfaceFinishId = (typeof SURFACE_FINISH_OPTIONS)[number]["id"];

export function surfaceFinishLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return SURFACE_FINISH_OPTIONS.find((o) => o.id === id)?.label ?? null;
}

export type MaterialFirestoreFields = {
  name: string;
  category: string;
  notes?: string | null;
  manufacturer?: string | null;
  purchasePrice?: number | null;
  /** Дата закупівлі, лише дата у форматі YYYY-MM-DD */
  purchaseDate?: string | null;
  productCode?: string | null;
  dimensions?: string | null;
  wallThickness?: string | null;
  /** Prof. Nostel — висота (напр. хвилі, мм) */
  sheetHeight?: string | null;
  /** Prof. Nostel — товщина металу */
  sheetThickness?: string | null;
  /** Prof. Nostel — глянець або мат */
  surfaceFinish?: string | null;
};

export type MaterialListItem = { id: string } & MaterialFirestoreFields;

function coercePurchasePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parsePurchasePriceInput(value);
  return null;
}

function coercePurchaseDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return parsePurchaseDateInput(value);
  const v = value as { toDate?: () => Date };
  if (typeof v.toDate === "function") {
    const d = v.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return formatYmdLocal(d);
  }
  return null;
}

function coerceSurfaceFinish(value: unknown): string | null {
  if (value === "glossy" || value === "matte") return value;
  return null;
}

/** Уніфікований розбір документа Firestore для списків матеріалів */
export function parseMaterialDoc(id: string, data: Record<string, unknown>): MaterialListItem {
  const category = String(data.category ?? "other");
  return {
    id,
    name: String(data.name ?? ""),
    category,
    notes: (data.notes as string | null | undefined) ?? null,
    manufacturer: (data.manufacturer as string | null | undefined) ?? null,
    purchasePrice: coercePurchasePrice(data.purchasePrice),
    purchaseDate: coercePurchaseDate(data.purchaseDate),
    productCode: (data.productCode as string | null | undefined) ?? null,
    dimensions: (data.dimensions as string | null | undefined) ?? null,
    wallThickness: (data.wallThickness as string | null | undefined) ?? null,
    sheetHeight: (data.sheetHeight as string | null | undefined) ?? null,
    sheetThickness: (data.sheetThickness as string | null | undefined) ?? null,
    surfaceFinish: coerceSurfaceFinish(data.surfaceFinish),
  };
}

/** Другий рядок(и) у списку — характеристики залежно від категорії */
export function materialDetailSubtexts(m: MaterialListItem): string[] {
  const lines: string[] = [];
  const price = formatPurchasePriceUa(m.purchasePrice ?? undefined);
  const dateLabel = formatPurchaseDateUa(m.purchaseDate ?? undefined);

  if (isPaintLikeCategory(m.category)) {
    const bits: string[] = [];
    if (m.manufacturer) bits.push(`Виробник: ${m.manufacturer}`);
    if (dateLabel) bits.push(`Дата закупівлі: ${dateLabel}`);
    if (price) bits.push(`Закупівля: ${price}`);
    if (bits.length) lines.push(bits.join(" · "));
  } else if (isProfNostelCategory(m.category)) {
    const bits: string[] = [];
    const hasNostel =
      (m.sheetHeight && m.sheetHeight.trim()) ||
      (m.sheetThickness && m.sheetThickness.trim()) ||
      surfaceFinishLabel(m.surfaceFinish);
    if (hasNostel) {
      if (m.sheetHeight?.trim()) bits.push(`Висота: ${m.sheetHeight.trim()}`);
      if (m.sheetThickness?.trim()) bits.push(`Товщина: ${m.sheetThickness.trim()}`);
      const sf = surfaceFinishLabel(m.surfaceFinish);
      if (sf) bits.push(`Поверхня: ${sf}`);
    } else {
      if (m.productCode) bits.push(`№ / артикул: ${m.productCode}`);
      if (m.dimensions) bits.push(`Розміри: ${m.dimensions}`);
      if (m.wallThickness) bits.push(`Товщина стінки: ${m.wallThickness}`);
    }
    if (dateLabel) bits.push(`Дата закупівлі: ${dateLabel}`);
    if (price) bits.push(`Закупівля: ${price}`);
    if (bits.length) lines.push(bits.join(" · "));
  } else if (isPipeCategory(m.category)) {
    const bits: string[] = [];
    if (m.productCode) bits.push(`№ / артикул: ${m.productCode}`);
    if (m.dimensions) bits.push(`Розміри: ${m.dimensions}`);
    if (m.wallThickness) bits.push(`Товщина стінки: ${m.wallThickness}`);
    if (dateLabel) bits.push(`Дата закупівлі: ${dateLabel}`);
    if (price) bits.push(`Закупівля: ${price}`);
    if (bits.length) lines.push(bits.join(" · "));
  } else if (price || dateLabel) {
    const bits: string[] = [];
    if (dateLabel) bits.push(`Дата закупівлі: ${dateLabel}`);
    if (price) bits.push(`Закупівля: ${price}`);
    lines.push(bits.join(" · "));
  }
  return lines;
}

export function materialSearchBlob(m: MaterialListItem): string {
  const sf = surfaceFinishLabel(m.surfaceFinish);
  return [
    m.name,
    materialCategoryLabel(m.category),
    m.notes ?? "",
    m.purchaseDate ?? "",
    m.sheetHeight ?? "",
    m.sheetThickness ?? "",
    sf ?? "",
    m.surfaceFinish ?? "",
    ...materialDetailSubtexts(m),
  ]
    .join(" ")
    .toLowerCase();
}
