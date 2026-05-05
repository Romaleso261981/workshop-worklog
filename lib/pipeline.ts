/** Canonical production stages in strict order (per order). */
export const PIPELINE_STAGES = [
  { id: "PACK", label: "Комплектація-поварка" },
  { id: "CLEAN", label: "Зачистка" },
  { id: "PAINT", label: "Фарбування" },
  { id: "PREP", label: "Упаковка на відправку" },
] as const;

export type StageId = (typeof PIPELINE_STAGES)[number]["id"];

/** Останній етап: після його завершення замовлення можна перевести в архів (автоматично в застосунку). */
export const PIPELINE_LAST_STAGE_ID: StageId = PIPELINE_STAGES[PIPELINE_STAGES.length - 1].id;

const LEGACY_PHASE: Record<string, StageId | string> = {
  PREPARATION: "PREP",
  PAINTING: "PAINT",
  /** Старий перший етап → нова «Комплектація-поварка» */
  STOCK: "PACK",
  /** Старий «Грунт» наближено вважаємо етапом «Зачистка» */
  PRIMER: "CLEAN",
  /** Старий «Відправлення» мапимо у фінальну «Упаковка на відправку» */
  SEND: "PREP",
};

/** Map old DB values to canonical stage ids for progress checks. */
export function normalizePhase(phase: string): string {
  return LEGACY_PHASE[phase] ?? phase;
}

export function stageLabel(phase: string): string {
  const id = normalizePhase(phase);
  const row = PIPELINE_STAGES.find((s) => s.id === id);
  return row?.label ?? phase;
}

export function isPaintStage(phase: string): boolean {
  return normalizePhase(phase) === "PAINT";
}

function hasEnded(endedAt: unknown): boolean {
  if (endedAt == null) return false;
  if (endedAt instanceof Date) return true;
  if (
    typeof endedAt === "object" &&
    endedAt !== null &&
    "toDate" in endedAt &&
    typeof (endedAt as { toDate: () => Date }).toDate === "function"
  ) {
    return true;
  }
  return false;
}

export function completedStagesFromEntries(
  entries: { phase: string; endedAt: unknown }[],
): Set<string> {
  const done = new Set<string>();
  for (const e of entries) {
    if (hasEnded(e.endedAt)) {
      done.add(normalizePhase(e.phase));
    }
  }
  return done;
}

/** First pipeline stage not yet completed (endedAt set) for this order. */
export function nextOpenStageId(done: Set<string>): StageId | null {
  for (const s of PIPELINE_STAGES) {
    if (!done.has(s.id)) return s.id;
  }
  return null;
}
