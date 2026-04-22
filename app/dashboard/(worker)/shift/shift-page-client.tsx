"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { ORDER_IN_PRODUCTION } from "@/lib/order-status";
import {
  completedStagesFromEntries,
  nextOpenStageId,
  stageLabel,
} from "@/lib/pipeline";
import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { ShiftWorkForm, type OrderShiftMeta } from "./shift-work-form";

export function ShiftPageClient() {
  const { user } = useAuth();
  const [metas, setMetas] = useState<OrderShiftMeta[]>([]);
  const [hasOpenShift, setHasOpenShift] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const [ordSnap, weSnap] = await Promise.all([
        getDocs(collection(db, COL.orders)),
        getDocs(collection(db, COL.workEntries)),
      ]);

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

    const entries = weSnap.docs.map((d) => {
      const x = d.data() as {
        userId?: string;
        orderId?: string;
        phase?: string;
        endedAt?: unknown;
      };
      return {
        id: d.id,
        userId: x.userId,
        orderId: x.orderId,
        phase: x.phase ?? "",
        endedAt: x.endedAt ?? null,
      };
    });

    setHasOpenShift(entries.some((e) => e.userId === user.uid && e.endedAt == null));

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
      setHasOpenShift(false);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити дані зміни.");
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Зміна</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Оберіть замовлення зі списку. Етапи строго по черзі: збір зі складу → підготовка → грунт → фарбування →
          упаковка. Після роботи натисніть «Завершити зміну» у шапці.
        </p>
        {loadError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      {hasOpenShift ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Завершіть поточну зміну в шапці сторінки, щоб почати новий етап.
        </div>
      ) : metas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted">
          Немає замовлень у виробництві. Адміністратор має додати замовлення в керуванні замовленнями — тоді вони
          з’являться тут.
        </div>
      ) : (
        <ShiftWorkForm orders={metas} onDone={() => void load()} />
      )}
    </div>
  );
}
