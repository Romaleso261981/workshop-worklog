import { PHASE_PAINTING, PHASE_PREPARATION } from "@/lib/work-constants";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

function phaseLabel(phase: string) {
  if (phase === PHASE_PREPARATION) return "Підготовка";
  if (phase === PHASE_PAINTING) return "Фарбування";
  return phase;
}

function parseColors(json: string | null): { color: string; amount: string }[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (x): x is { color: string; amount: string } =>
          typeof x === "object" &&
          x !== null &&
          "color" in x &&
          "amount" in x &&
          typeof (x as { color: unknown }).color === "string" &&
          typeof (x as { amount: unknown }).amount === "string",
      )
      .map((x) => ({ color: x.color, amount: x.amount }));
  } catch {
    return [];
  }
}

export default async function JournalPage() {
  const entries = await prisma.workEntry.findMany({
    take: 150,
    orderBy: { startedAt: "desc" },
    include: { user: true, order: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Журнал</h1>
        <p className="mt-2 text-sm text-muted">
          Останні записи всіх працівників по замовленнях (підготовка та фарбування).
        </p>
      </div>

      <ul className="space-y-3">
        {entries.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted">
            Поки що немає записів.
          </li>
        ) : (
          entries.map((e) => {
            const colors = parseColors(e.paintingColors);
            return (
              <li
                key={e.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-foreground">
                    Замовлення <span className="tabular-nums">{e.order.number}</span>
                    <span className="ml-2 text-sm font-normal text-muted">
                      · {phaseLabel(e.phase)}
                    </span>
                  </p>
                  <span className="text-xs text-muted">{e.user.displayName}</span>
                </div>
                {e.order.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{e.order.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  Початок: {formatDateTime(e.startedAt)}
                  {e.endedAt ? (
                    <> · Завершення: {formatDateTime(e.endedAt)}</>
                  ) : (
                    <> · <span className="font-medium text-amber-800">триває</span></>
                  )}
                </p>
                {e.phase === PHASE_PREPARATION && e.beforeOrderNotes ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{e.beforeOrderNotes}</p>
                ) : null}
                {e.phase === PHASE_PAINTING && colors.length > 0 ? (
                  <ul className="mt-3 list-inside list-disc text-sm text-foreground">
                    {colors.map((c, i) => (
                      <li key={i}>
                        {c.color} — {c.amount}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {e.phase === PHASE_PAINTING && e.paintingMaterials ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                    <span className="font-medium text-foreground">Матеріали: </span>
                    {e.paintingMaterials}
                  </p>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
