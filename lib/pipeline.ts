/** Canonical production stages in strict order (per order). */
export const PIPELINE_STAGES = [
  { id: "STOCK", label: "Збір зі складу / комплектація" },
  { id: "PREP", label: "Підготовка" },
  { id: "PRIMER", label: "Грунт" },
  { id: "PAINT", label: "Фарбування" },
  { id: "PACK", label: "Упаковка" },
] as const;

export type StageId = (typeof PIPELINE_STAGES)[number]["id"];

const LEGACY_PHASE: Record<string, StageId | string> = {
  PREPARATION: "PREP",
  PAINTING: "PAINT",
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
