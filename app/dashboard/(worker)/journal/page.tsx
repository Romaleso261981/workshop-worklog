"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { formatDateTime } from "@/lib/format";
import { WorkJournalPagination, WORK_JOURNAL_PAGE_SIZE } from "@/components/work-journal-pagination";
import type { JournalOrderSource } from "@/lib/work-journal-orders";
import { journalOrdersFromEntries } from "@/lib/work-journal-orders";
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
      const [weSnap, ordSnap] = await Promise.all([
        getDocs(
          query(collection(db, COL.workEntries), where("userId", "==", user.uid)),
        ),
        getDocs(collection(db, COL.orders)),
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

    setRows(list);
    setOrdersById(orderJournalById);
    } catch (e) {
      setRows([]);
      setOrdersById({});
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
            const created =
              o.createdAt &&
              typeof o.createdAt === "object" &&
              "toDate" in o.createdAt &&
              typeof (o.createdAt as { toDate: () => Date }).toDate === "function"
                ? formatDateTime((o.createdAt as { toDate: () => Date }).toDate())
                : "—";
            const closed =
              !o.inProduction &&
              o.completedAt &&
              typeof o.completedAt === "object" &&
              "toDate" in o.completedAt &&
              typeof (o.completedAt as { toDate: () => Date }).toDate === "function"
                ? formatDateTime((o.completedAt as { toDate: () => Date }).toDate())
                : null;

            return (
              <li key={o.orderId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">
                      Замовлення <span className="tabular-nums">{o.number}</span>
                      {o.localityLabel !== "—" ? (
                        <span className="ml-2 text-sm font-normal text-muted">· {o.localityLabel}</span>
                      ) : null}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Створено: <span className="text-foreground">{created}</span>
                      {" · "}
                      {closed ? (
                        <>
                          Завершено: <span className="text-foreground">{closed}</span>
                        </>
                      ) : (
                        <span className="text-amber-800">У виробництві</span>
                      )}
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
