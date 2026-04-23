"use client";

/** Скільки записів журналу робіт показувати на одній сторінці. */
export const WORK_JOURNAL_PAGE_SIZE = 5;

type Props = {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function WorkJournalPagination({ page, total, onPageChange }: Props) {
  const size = WORK_JOURNAL_PAGE_SIZE;
  const totalPages = Math.ceil(total / size);
  if (total === 0 || totalPages <= 1) return null;

  const canPrev = page > 0;
  const canNext = page < totalPages - 1;
  const btnClass =
    "rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-4"
      aria-label="Сторінки журналу"
    >
      <button type="button" disabled={!canPrev} onClick={() => onPageChange(page - 1)} className={btnClass}>
        Попередня
      </button>
      <span className="text-sm text-muted">
        Сторінка <span className="font-medium tabular-nums text-foreground">{page + 1}</span> з{" "}
        <span className="tabular-nums">{totalPages}</span>
        <span className="ml-2 text-xs">(по {size} записів)</span>
      </span>
      <button type="button" disabled={!canNext} onClick={() => onPageChange(page + 1)} className={btnClass}>
        Наступна
      </button>
    </nav>
  );
}
