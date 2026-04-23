export function formatDateTime(d: Date): string {
  return d.toLocaleString("uk-UA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Тривалість для підсумків робочого часу: лише «11 год 41 хв» або «45 хв», без суми хвилин у дужках.
 */
export function formatDurationMsUk(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (totalMinutes === 0) return "0 хв";
  if (h === 0) return `${m} хв`;
  return m > 0 ? `${h} год ${m} хв` : `${h} год`;
}
