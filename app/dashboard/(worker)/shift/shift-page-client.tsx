"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { moveOrderBoardStageFirestore } from "@/lib/firestore/shift-ops";
import { SHIFT_KANBAN_COLUMN_IDS, SHIFT_KANBAN_STAGES, type ShiftKanbanColumnId } from "@/lib/kanban-stages";
import { canManageOrders } from "@/lib/order-manager-role";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { completedStagesFromEntries, nextOpenStageId, normalizePhase, stageLabel } from "@/lib/pipeline";
import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

type BoardColumnId = ShiftKanbanColumnId;
type BoardOrder = {
  id: string;
  number: string;
  title: string | null;
  description: string;
  status: string;
  boardStage: string | null;
};

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
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [workEntries, setWorkEntries] = useState<WorkEntryRow[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShiftRow[]>([]);
  const [workerStatuses, setWorkerStatuses] = useState<WorkerStatusRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
            boardStage?: string | null;
          };
          return {
            id: d.id,
            number: x.number ?? "",
            title: x.title ?? null,
            description: x.description ?? "",
            status: x.status ?? ORDER_IN_PRODUCTION,
            boardStage: typeof x.boardStage === "string" ? x.boardStage : null,
          };
        })
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
      setWorkEntries(entries);

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

      setOrders(orders);
    } catch (e) {
      setOrders([]);
      setWorkEntries([]);
      setActiveShifts([]);
      setWorkerStatuses([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити дані зміни.");
    }
  }, [user, profile?.role]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [load]);

  const columns = useMemo(
    () => [
      { id: "NEW" as const, label: "Нові" },
      ...SHIFT_KANBAN_STAGES.map((s) => ({ id: s.id as BoardColumnId, label: s.label })),
    ],
    [],
  );

  const entriesByOrder = useMemo(() => {
    const byOrder = new Map<string, WorkEntryRow[]>();
    for (const row of workEntries) {
      if (!row.orderId) continue;
      const list = byOrder.get(row.orderId);
      if (list) list.push(row);
      else byOrder.set(row.orderId, [row]);
    }
    return byOrder;
  }, [workEntries]);

  const orderColumn = useCallback(
    (order: BoardOrder): BoardColumnId => {
      if (order.boardStage && SHIFT_KANBAN_COLUMN_IDS.includes(order.boardStage as BoardColumnId)) {
        return order.boardStage as BoardColumnId;
      }
      const rows = entriesByOrder.get(order.id) ?? [];
      const inWork = rows.find((x) => x.endedAt == null);
      if (inWork?.phase) {
        const normalized = normalizePhase(inWork.phase);
        if (SHIFT_KANBAN_COLUMN_IDS.includes(normalized as BoardColumnId)) {
          return normalized as BoardColumnId;
        }
      }
      if (order.status === ORDER_DONE) return "PREP";
      const done = completedStagesFromEntries(rows.map((x) => ({ phase: x.phase, endedAt: x.endedAt })));
      const next = nextOpenStageId(done);
      if (next && SHIFT_KANBAN_COLUMN_IDS.includes(next as BoardColumnId)) {
        return next as BoardColumnId;
      }
      return "NEW";
    },
    [entriesByOrder],
  );

  const ordersByColumn = useMemo(() => {
    const map: Record<BoardColumnId, BoardOrder[]> = {
      NEW: [],
      PACK: [],
      CLEAN: [],
      PAINT: [],
      PREP: [],
    };
    for (const order of orders) {
      map[orderColumn(order)].push(order);
    }
    for (const key of Object.keys(map) as BoardColumnId[]) {
      map[key].sort((a, b) => a.number.localeCompare(b.number, "uk", { numeric: true }));
    }
    return map;
  }, [orders, orderColumn]);

  const showWorkshopOverview = canManageOrders(profile?.role);

  async function onDragEnd(event: DragEndEvent) {
    const orderId = String(event.active.id ?? "");
    const target = event.over?.id ? String(event.over.id) : "";
    if (!orderId || !target) return;
    const targetColumn = columns.find((x) => x.id === target)?.id;
    if (!targetColumn) return;
    const order = orders.find((x) => x.id === orderId);
    if (!order) return;
    if (orderColumn(order) === targetColumn) return;

    try {
      setMoveError(null);
      setMovingOrderId(orderId);
      const res = await moveOrderBoardStageFirestore({ orderId, targetColumn });
      if ("error" in res) {
        setMoveError(res.error);
        return;
      }
      await load();
    } catch {
      setMoveError("Не вдалося перемістити картку.");
    } finally {
      setMovingOrderId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="relative left-1/2 right-1/2 w-screen max-w-none -translate-x-1/2 space-y-6 px-4 sm:px-6 lg:px-8 2xl:px-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Зміна</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Kanban-дошка відображає всі замовлення по етапах. Перетягніть картку у потрібну колонку, щоб оновити етап.
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
        {moveError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {moveError}
          </p>
        ) : null}
      </div>

      {!loadError ? (
        <DndContext sensors={sensors} onDragEnd={(event) => void onDragEnd(event)}>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Kanban замовлень</h2>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max items-start gap-4">
              {columns.map((column) => (
                <div key={column.id} className="w-72 min-w-72 flex-none lg:w-76 lg:min-w-76">
                  <KanbanColumn
                    id={column.id}
                    title={column.label}
                    orders={ordersByColumn[column.id]}
                    movingOrderId={movingOrderId}
                  />
                </div>
              ))}
              </div>
            </div>
          </section>
        </DndContext>
      ) : null}

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
    </div>
  );
}

function KanbanColumn({
  id,
  title,
  orders,
  movingOrderId,
}: {
  id: BoardColumnId;
  title: string;
  orders: BoardOrder[];
  movingOrderId: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[220px] rounded-xl border p-3 transition ${
        isOver ? "border-accent bg-accent-soft/40" : "border-border bg-card"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{orders.length}</span>
      </div>
      <div className="space-y-2">
        {orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-muted">
            Порожньо
          </p>
        ) : (
          orders.map((order) => (
            <KanbanCard key={order.id} order={order} isMoving={movingOrderId === order.id} />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  order,
  isMoving,
}: {
  order: BoardOrder;
  isMoving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-border bg-card px-3 py-2 shadow-sm active:cursor-grabbing ${
        isDragging || isMoving ? "opacity-60" : ""
      }`}
    >
      <p className="text-sm font-semibold text-foreground tabular-nums">{order.number}</p>
      {order.title ? <p className="mt-1 text-xs text-muted">{order.title}</p> : null}
      {order.description ? <p className="mt-2 line-clamp-3 text-xs text-foreground/90">{order.description}</p> : null}
    </article>
  );
}
