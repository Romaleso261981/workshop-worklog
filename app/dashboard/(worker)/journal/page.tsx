"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { WorkJournalPagination, WORK_JOURNAL_PAGE_SIZE } from "@/components/work-journal-pagination";
import type { JournalOrderSource } from "@/lib/work-journal-orders";
import { journalOrdersFromEntries } from "@/lib/work-journal-orders";
import { completedStagesFromEntries, nextOpenStageId, stageLabel } from "@/lib/pipeline";
import { ORDER_DONE } from "@/lib/order-status";
import { collection, getDocs, query, where } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  orderId: string;
  startedAt?: unknown;
};

export default function JournalPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, JournalOrderSource>>({});
  const [progressByOrder, setProgressByOrder] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      return;
    }
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const [weSnap, ordSnap, allEntriesSnap] = await Promise.all([
        getDocs(
          query(collection(db, COL.workEntries), where("userId", "==", user.uid)),
        ),
        getDocs(collection(db, COL.orders)),
        getDocs(collection(db, COL.workEntries)),
      ]);
    const orderJournalById: Record<string, JournalOrderSource> = Object.fromEntries(
      ordSnap.docs.map((d) => {
        const x = d.data() as {
          number?: string;
          createdAt?: unknown;
          completedAt?: unknown;
          status?: string;
          npSettlementLabel?: string | null;
          title?: string | null;
          orderFor?: string | null;
        };
        return [
          d.id,
          {
            number: x.number ?? "",
            createdAt: x.createdAt,
            completedAt: x.completedAt,
            status: x.status,
            npSettlementLabel: x.npSettlementLabel ?? null,
            title: x.title ?? null,
            orderFor: x.orderFor ?? null,
          },
        ];
      }),
    );

    const list: Row[] = weSnap.docs.map((d) => {
      const x = d.data() as { startedAt?: unknown; orderId?: string };
      return {
        orderId: x.orderId ?? "",
        startedAt: x.startedAt,
      };
    });

    list.sort((a, b) => {
      const ta =
        a.startedAt &&
        typeof a.startedAt === "object" &&
        "toMillis" in (a.startedAt as object)
          ? (a.startedAt as { toMillis: () => number }).toMillis()
          : 0;
      const tb =
        b.startedAt &&
        typeof b.startedAt === "object" &&
        "toMillis" in (b.startedAt as object)
          ? (b.startedAt as { toMillis: () => number }).toMillis()
          : 0;
      return tb - ta;
    });

    const progressRowsByOrder = new Map<string, { phase: string; endedAt: unknown }[]>();
    for (const d of allEntriesSnap.docs) {
      const x = d.data() as { orderId?: string; phase?: string; endedAt?: unknown };
      const orderId = String(x.orderId ?? "").trim();
      if (!orderId) continue;
      const row = { phase: String(x.phase ?? ""), endedAt: x.endedAt ?? null };
      const arr = progressRowsByOrder.get(orderId);
      if (arr) arr.push(row);
      else progressRowsByOrder.set(orderId, [row]);
    }

    const progressTextByOrder: Record<string, string> = {};
    for (const row of list) {
      const orderId = row.orderId?.trim();
      if (!orderId) continue;
      const order = orderJournalById[orderId];
      if (!order) continue;
      if ((order.status ?? "") === ORDER_DONE) {
        progressTextByOrder[orderId] = "Завершено";
        continue;
      }
      const entries = progressRowsByOrder.get(orderId) ?? [];
      const inWork = entries.find((e) => e.endedAt == null);
      if (inWork) {
        progressTextByOrder[orderId] = `В роботі: ${stageLabel(inWork.phase)}`;
        continue;
      }
      const done = completedStagesFromEntries(entries);
      const next = nextOpenStageId(done);
      progressTextByOrder[orderId] = next ? `Очікує етап: ${stageLabel(next)}` : "Завершено";
    }

    setRows(list);
    setOrdersById(orderJournalById);
    setProgressByOrder(progressTextByOrder);
    } catch (e) {
      setRows([]);
      setOrdersById({});
      setProgressByOrder({});
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити журнал.");
    }
  }, [user]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const journalOrders = useMemo(() => journalOrdersFromEntries(rows, ordersById), [rows, ordersById]);

  const journalMaxPage = useMemo(
    () => Math.max(0, Math.ceil(journalOrders.length / WORK_JOURNAL_PAGE_SIZE) - 1),
    [journalOrders.length],
  );
  const safeJournalPage = Math.min(Math.max(0, page), journalMaxPage);

  const pagedOrders = useMemo(() => {
    const start = safeJournalPage * WORK_JOURNAL_PAGE_SIZE;
    return journalOrders.slice(start, start + WORK_JOURNAL_PAGE_SIZE);
  }, [journalOrders, safeJournalPage]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Журнал</h1>
        {loadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted">
          Один рядок на замовлення, де ви вели зміну. Повні деталі (етапи, хто, коли) — у картці замовлення. По{" "}
          {WORK_JOURNAL_PAGE_SIZE} замовлень на сторінку.
        </p>
      </div>

      <ul className="space-y-3">
        {journalOrders.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted">
            Поки що немає замовлень за вашими змінами.
          </li>
        ) : (
          pagedOrders.map((o) => {
            return (
              <li key={o.orderId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">
                      Замовлення <span className="tabular-nums">{o.number}</span>
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Етап: <span className="text-foreground">{progressByOrder[o.orderId] ?? (o.inProduction ? "У виробництві" : "Завершено")}</span>
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/orders/${o.orderId}`}
                    className="shrink-0 text-sm font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Деталі →
                  </Link>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <WorkJournalPagination page={safeJournalPage} total={journalOrders.length} onPageChange={setPage} />
    </div>
  );
}
