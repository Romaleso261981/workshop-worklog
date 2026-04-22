"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { formatDateTime } from "@/lib/format";
import { isPaintStage, stageLabel } from "@/lib/pipeline";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function parseColors(json: string | null | undefined): { color: string; amount: string }[] {
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

type Row = {
  id: string;
  phase: string;
  beforeOrderNotes?: string | null;
  paintingColors?: string | null;
  paintingMaterials?: string | null;
  startedAt?: unknown;
  endedAt?: unknown;
  userId?: string;
  orderId?: string;
  orderNumber?: string;
  orderDescription?: string;
  userName: string;
};

export default function AdminWorkJournalPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const [weSnap, ordSnap, uSnap] = await Promise.all([
        getDocs(collection(db, COL.workEntries)),
        getDocs(collection(db, COL.orders)),
        getDocs(collection(db, COL.users)),
      ]);
      const orderMap = Object.fromEntries(
        ordSnap.docs.map((d) => {
          const x = d.data() as { description?: string; number?: string };
          return [d.id, { description: x.description ?? "", number: x.number ?? "" }];
        }),
      );
      const userMap = Object.fromEntries(
        uSnap.docs.map((d) => {
          const x = d.data() as { displayName?: string; email?: string };
          const name = (x.displayName ?? "").trim() || (x.email ?? "").trim() || d.id;
          return [d.id, name];
        }),
      );

      const list: Row[] = weSnap.docs.map((d) => {
        const x = d.data() as {
          phase?: string;
          beforeOrderNotes?: string | null;
          paintingColors?: string | null;
          paintingMaterials?: string | null;
          startedAt?: unknown;
          endedAt?: unknown;
          userId?: string;
          orderId?: string;
          orderNumber?: string;
        };
        const oid = x.orderId ?? "";
        const om = orderMap[oid] as { description?: string; number?: string } | undefined;
        const uid = x.userId ?? "";
        return {
          id: d.id,
          phase: x.phase ?? "",
          beforeOrderNotes: x.beforeOrderNotes,
          paintingColors: x.paintingColors,
          paintingMaterials: x.paintingMaterials,
          startedAt: x.startedAt,
          endedAt: x.endedAt,
          userId: uid,
          orderId: oid,
          orderNumber: x.orderNumber ?? om?.number ?? "",
          orderDescription: om?.description ?? "",
          userName: (userMap[uid] && String(userMap[uid]).trim()) || uid || "—",
        };
      });

      list.sort((a, b) => {
        const ta =
          a.startedAt && typeof a.startedAt === "object" && "toMillis" in (a.startedAt as object)
            ? (a.startedAt as { toMillis: () => number }).toMillis()
            : 0;
        const tb =
          b.startedAt && typeof b.startedAt === "object" && "toMillis" in (b.startedAt as object)
            ? (b.startedAt as { toMillis: () => number }).toMillis()
            : 0;
        return tb - ta;
      });

      setRows(list.slice(0, 300));
    } catch (e) {
      setRows([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити журнал.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
          ← Головна
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Журнал робіт</h1>
        <p className="mt-1 text-sm text-muted">
          Усі зміни та етапи по замовленнях (усі працівники). Останні записи зверху.
        </p>
        {loadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      <ul className="space-y-3">
        {rows.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted">
            Поки що немає записів.
          </li>
        ) : (
          rows.map((e) => {
            const colors = parseColors(e.paintingColors);
            const paint = isPaintStage(e.phase);
            const start =
              e.startedAt &&
              typeof e.startedAt === "object" &&
              "toDate" in e.startedAt &&
              typeof (e.startedAt as { toDate: () => Date }).toDate === "function"
                ? formatDateTime((e.startedAt as { toDate: () => Date }).toDate())
                : "—";
            const end =
              e.endedAt &&
              typeof e.endedAt === "object" &&
              "toDate" in e.endedAt &&
              typeof (e.endedAt as { toDate: () => Date }).toDate === "function"
                ? formatDateTime((e.endedAt as { toDate: () => Date }).toDate())
                : null;

            return (
              <li key={e.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-foreground">
                    Замовлення <span className="tabular-nums">{e.orderNumber}</span>
                    <span className="ml-2 text-sm font-normal text-muted">· {stageLabel(e.phase)}</span>
                  </p>
                  <span className="text-xs text-muted">{e.userName}</span>
                </div>
                {e.orderDescription ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{e.orderDescription}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  Початок: {start}
                  {end ? (
                    <> · Завершення: {end}</>
                  ) : (
                    <> · <span className="font-medium text-amber-800">триває</span></>
                  )}
                </p>
                {!paint && e.beforeOrderNotes ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{e.beforeOrderNotes}</p>
                ) : null}
                {paint && colors.length > 0 ? (
                  <ul className="mt-3 list-inside list-disc text-sm text-foreground">
                    {colors.map((c, i) => (
                      <li key={i}>
                        {c.color} — {c.amount}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {paint && e.paintingMaterials ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                    <span className="font-medium text-foreground">Матеріали: </span>
                    {e.paintingMaterials}
                  </p>
                ) : null}
                {paint && e.beforeOrderNotes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                    <span className="font-medium text-foreground">Примітки: </span>
                    {e.beforeOrderNotes}
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
