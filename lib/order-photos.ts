/** Максимум зображень на одне замовлення (необов’язкове поле). */
export const ORDER_PHOTOS_MAX_COUNT = 20;
/** Обмеження розміру одного файлу (МБ). */
export const ORDER_PHOTOS_MAX_FILE_MB = 8;

export function normalizeOrderPhotoUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u.trim())).map((u) => u.trim());
}
