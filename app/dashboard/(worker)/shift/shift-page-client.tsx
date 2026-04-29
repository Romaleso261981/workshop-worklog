"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { canManageOrders } from "@/lib/order-manager-role";
import { ORDER_IN_PRODUCTION } from "@/lib/order-status";
import {
  completedStagesFromEntries,
  nextOpenStageId,
  stageLabel,
} from "@/lib/pipeline";
import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShiftWorkForm, type OrderShiftMeta } from "./shift-work-form";

type WorkEntryRow = {
  id: string;
  userId: string;
  orderId: string;
  phase: string;
  endedAt: unknown | null;
  beforeOrderNotes: string | null;
  orderNumber: string;
};

type ActiveShiftRow = {
  entryId: string;
  userId: string;
  userName: string;
  orderNumber: string;
  orderTitle: string | null;
  phaseLabel: string;
  notesPreview: string | null;
};

type WorkerStatusRow = {
  uid: string;
  name: string;
  isSelf: boolean;
  shift: ActiveShiftRow | null;
};

function previewNotes(text: string | null, max = 140): string | null {
  if (text == null) return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function ShiftPageClient() {
  const { user, profile } = useAuth();
  const [metas, setMetas] = useState<OrderShiftMeta[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShiftRow[]>([]);
  const [workerStatuses, setWorkerStatuses] = useState<WorkerStatusRow[]>([]);
  const [hasOpenShift, setHasOpenShift] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const isManager = canManageOrders(profile?.role);
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const [ordSnap, weSnap] = await Promise.all([
        getDocs(collection(db, COL.orders)),
        getDocs(collection(db, COL.workEntries)),
      ]);
      const uSnap = isManager ? await getDocs(collection(db, COL.users)) : null;

      const userMap = uSnap
        ? Object.fromEntries(
            uSnap.docs.map((d) => {
              const x = d.data() as { displayName?: string; email?: string };
              const name = (x.displayName ?? "").trim() || (x.email ?? "").trim() || d.id;
              return [d.id, name];
            }),
          )
        : {};

      const orders = ordSnap.docs
        .map((d) => {
          const x = d.data() as {
            number?: string;
            title?: string | null;
            description?: string;
            status?: string;
          };
          return {
            id: d.id,
            number: x.number ?? "",
            title: x.title ?? null,
            description: x.description ?? "",
            status: x.status,
          };
        })
        .filter((o) => o.status === ORDER_IN_PRODUCTION)
        .sort((a, b) => a.number.localeCompare(b.number));

      const orderTitleById = Object.fromEntries(orders.map((o) => [o.id, o.title]));

      const entries: WorkEntryRow[] = weSnap.docs.map((d) => {
        const x = d.data() as {
          userId?: string;
          orderId?: string;
          phase?: string;
          endedAt?: unknown;
          beforeOrderNotes?: string | null;
          orderNumber?: string;
        };
        return {
          id: d.id,
          userId: x.userId ?? "",
          orderId: x.orderId ?? "",
          phase: x.phase ?? "",
          endedAt: x.endedAt ?? null,
          beforeOrderNotes: x.beforeOrderNotes ?? null,
          orderNumber: x.orderNumber ?? "",
        };
      });

      setHasOpenShift(entries.some((e) => e.userId === user.uid && e.endedAt == null));

      if (isManager && uSnap) {
        const inProductionIds = new Set(orders.map((o) => o.id));
        const openForDisplay = entries.filter((e) => e.endedAt == null && e.orderId && inProductionIds.has(e.orderId));

        const activeList: ActiveShiftRow[] = openForDisplay.map((e) => {
          const uid = e.userId;
          const uname = (userMap[uid] && String(userMap[uid]).trim()) || uid || "—";
          const title = orderTitleById[e.orderId] ?? null;
          const num = e.orderNumber || orders.find((o) => o.id === e.orderId)?.number || "—";
          return {
            entryId: e.id,
            userId: uid,
            userName: uname,
            orderNumber: num,
            orderTitle: title,
            phaseLabel: stageLabel(e.phase),
            notesPreview: previewNotes(e.beforeOrderNotes),
          };
        });
        activeList.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, "uk", { numeric: true }));
        setActiveShifts(activeList);

        const byUserShift = new Map<string, ActiveShiftRow>();
        for (const row of activeList) {
          byUserShift.set(row.userId, row);
        }

        const workers: WorkerStatusRow[] = uSnap.docs.map((d) => {
          const x = d.data() as { displayName?: string; email?: string };
          const name = (x.displayName ?? "").trim() || (x.email ?? "").trim() || d.id;
          return {
            uid: d.id,
            name,
            isSelf: d.id === user.uid,
            shift: byUserShift.get(d.id) ?? null,
          };
        });
        workers.sort((a, b) => {
          const ab = a.shift ? 1 : 0;
          const bb = b.shift ? 1 : 0;
          if (ab !== bb) return bb - ab;
          return a.name.localeCompare(b.name, "uk");
        });
        setWorkerStatuses(workers);
      } else {
        setActiveShifts([]);
        setWorkerStatuses([]);
      }

      const meta: OrderShiftMeta[] = [];
      for (const o of orders) {
        const forOrder = entries.filter((e) => e.orderId === o.id);
        const done = completedStagesFromEntries(
          forOrder.map((e) => ({ phase: e.phase, endedAt: e.endedAt })),
        );
        const next = nextOpenStageId(done);
        const open = forOrder.find((e) => e.endedAt == null);
        meta.push({
          id: o.id,
          number: o.number,
          title: o.title,
          description: o.description,
          nextStageId: next,
          nextLabel: next ? stageLabel(next) : null,
          allDone: next === null && !open,
          blocked: !!open,
          activePhaseLabel: open ? stageLabel(open.phase) : null,
        });
      }
      setMetas(meta);
    } catch (e) {
      setMetas([]);
      setActiveShifts([]);
      setWorkerStatuses([]);
      setHasOpenShift(false);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити дані зміни.");
    }
  }, [user, profile?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickableOrders = useMemo(
    () => metas.filter((m) => !m.blocked && m.nextStageId != null),
    [metas],
  );

  const showWorkshopOverview = canManageOrders(profile?.role);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Зміна</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          У списку нижче лише замовлення, по яких зараз ніхто не веде зміну — якщо колега вже «на замовленні», воно
          зникає з вибору. Етапи: комплектування та зварювання → фарбування → підготовка → упаковка → відправлення. Після останнього
          етапу замовлення автоматично в архіві. Після роботи натисніть «Завершити зміну» у шапці.
          {showWorkshopOverview ? (
            <>
              {" "}
              Огляд активних змін і зайнятості працівників нижче бачать лише адміністратори та власники.
            </>
          ) : null}
        </p>
        {loadError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      {!loadError && showWorkshopOverview ? (
        <>
          <section className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Активні зміни по цеху</h2>
            <p className="text-sm text-muted">
              Хто зараз на замовленні та на якому етапі; у колонці «Що робить» — короткий запис з початку зміни
              (примітки при старті етапу).
            </p>
            {activeShifts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                Немає відкритих змін по замовленнях у виробництві.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {activeShifts.map((row) => (
                  <li key={row.entryId} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">{row.userName}</span>
                      <span className="text-xs text-muted">
                        Замовлення <span className="tabular-nums font-medium text-foreground">{row.orderNumber}</span>
                        {row.orderTitle ? <span className="text-muted"> — {row.orderTitle}</span> : null}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Етап: <span className="font-medium text-foreground">{row.phaseLabel}</span>
                    </p>
                    {row.notesPreview ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{row.notesPreview}</p>
                    ) : (
                      <p className="mt-1 text-xs italic text-muted">Без тексту при старті (наприклад, лише кольори на фарбуванні)</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Хто вільний, хто зайнятий</h2>
            <p className="text-sm text-muted">Усі облікові записи з розділу користувачів.</p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {workerStatuses.map((w) => (
                <li key={w.uid} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium text-foreground">
                      {w.name}
                      {w.isSelf ? (
                        <span className="ml-2 text-xs font-normal text-muted">(ви)</span>
                      ) : null}
                    </span>
                    {w.shift ? (
                      <p className="mt-1 text-xs text-muted">
                        Зайнятий: замовлення <span className="tabular-nums text-foreground">{w.shift.orderNumber}</span>
                        {w.shift.orderTitle ? <span> — {w.shift.orderTitle}</span> : null} ·{" "}
                        <span className="text-foreground">{w.shift.phaseLabel}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted">Вільний</p>
                    )}
                  </div>
                  {w.shift?.notesPreview ? (
                    <p className="max-w-md text-xs text-muted">{w.shift.notesPreview}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {hasOpenShift ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Завершіть поточну зміну в шапці сторінки, щоб почати новий етап.
        </div>
      ) : metas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted">
          Немає замовлень у виробництві. Адміністратор має додати замовлення в керуванні замовленнями — тоді вони
          з’являться тут.
        </div>
      ) : pickableOrders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
          <p className="text-foreground">
            Зараз усі замовлення у виробництві вже взяті в роботу колегами, або по них немає наступного етапу.
          </p>
          {showWorkshopOverview ? (
            <p className="mt-2">
              Перегляньте блоки вище: видно, хто на якому замовленні. Коли колега натисне «Завершити зміну», замовлення
              знову з’явиться у списку вибору (якщо наступний етап ще не завершений).
            </p>
          ) : (
            <p className="mt-2">
              Дочекайтесь, поки колега завершить зміну в шапці — тоді замовлення знову з’явиться у списку (якщо наступний
              етап ще не завершений).
            </p>
          )}
        </div>
      ) : (
        <ShiftWorkForm orders={pickableOrders} onDone={() => void load()} />
      )}
    </div>
  );
}
