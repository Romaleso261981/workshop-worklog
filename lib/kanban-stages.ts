export const SHIFT_KANBAN_STAGES = [
  { id: "PACK", label: "Комплектація-поварка" },
  { id: "CLEAN", label: "Зачистка" },
  { id: "PAINT", label: "Фарбування" },
  { id: "PREP", label: "Упаковка на відправку" },
] as const;

export const SHIFT_KANBAN_COLUMN_IDS = [
  "NEW",
  ...SHIFT_KANBAN_STAGES.map((stage) => stage.id),
] as const;

export type ShiftKanbanStageId = (typeof SHIFT_KANBAN_STAGES)[number]["id"];
export type ShiftKanbanColumnId = (typeof SHIFT_KANBAN_COLUMN_IDS)[number];
