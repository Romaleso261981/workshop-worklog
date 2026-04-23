import { ORDER_DONE } from "@/lib/order-status";

/** Поля замовлення, потрібні для зведеного рядка журналу (без повторів по етапах). */
export type JournalOrderSource = {
  number: string;
  createdAt?: unknown;
  completedAt?: unknown;
  status?: string;
  npSettlementLabel?: string | null;
  title?: string | null;
  orderFor?: string | null;
};

export type JournalOrderListItem = {
  orderId: string;
  number: string;
  /** Населений пункт НП, або назва, або «для кого» — короткий рядок як у списку. */
  localityLabel: string;
  createdAt?: unknown;
  completedAt?: unknown | null;
  inProduction: boolean;
  /** Для сортування: остання активність зміни в межах відфільтрованих записів. */
  lastActivityMs: number;
};

function entryStartedMs(startedAt: unknown): number {
  if (
    startedAt &&
    typeof startedAt === "object" &&
    "toMillis" in startedAt &&
    typeof (startedAt as { toMillis: () => number }).toMillis === "function"
  ) {
    return (startedAt as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/** Групує записи змін по `orderId`: один елемент списку на замовлення. */
export function journalOrdersFromEntries(
  entries: { orderId?: string; startedAt?: unknown }[],
  orderById: Record<string, JournalOrderSource | undefined>,
): JournalOrderListItem[] {
  const lastByOrder = new Map<string, number>();
  for (const e of entries) {
    const id = e.orderId?.trim() ?? "";
    if (!id) continue;
    const t = entryStartedMs(e.startedAt);
    const prev = lastByOrder.get(id) ?? 0;
    if (t >= prev) lastByOrder.set(id, t);
  }

  const out: JournalOrderListItem[] = [];
  for (const [orderId, lastActivityMs] of lastByOrder) {
    const o = orderById[orderId];
    if (!o) continue;
    const st = o.status ?? "";
    const inProduction = st !== ORDER_DONE;
    const locality =
      (o.npSettlementLabel ?? "").trim() ||
      (o.title ?? "").trim() ||
      (o.orderFor ?? "").trim() ||
      "—";
    out.push({
      orderId,
      number: o.number || "—",
      localityLabel: locality,
      createdAt: o.createdAt,
      completedAt: inProduction ? null : (o.completedAt ?? null),
      inProduction,
      lastActivityMs,
    });
  }
  out.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  return out;
}
