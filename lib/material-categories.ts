export const MATERIAL_CATEGORIES = [
  { id: "paint", label: "Фарби / лаки" },
  { id: "fastener", label: "Кріплення (гвинти, шурупи)" },
  { id: "profile", label: "Профіль / метал" },
  { id: "pipe", label: "Труби" },
  { id: "other", label: "Інше" },
] as const;

export type MaterialCategoryId = (typeof MATERIAL_CATEGORIES)[number]["id"];

export function materialCategoryLabel(id: string): string {
  return MATERIAL_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
