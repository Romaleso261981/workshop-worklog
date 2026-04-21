"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OrderRow = {
  id: string;
  number: string;
  title: string | null;
  description: string;
  details?: string | null;
  status: string;
  completedAt?: unknown;
};

export default function OrdersCatalogPage() {
  const { user } = useAuth();
  const [active, setActive] = useState<OrderRow[]>([]);
  const [done, setDone] = useState<OrderRow[]>([]);
  const [managerCount, setManagerCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const [ordSnap, userSnap] = await Promise.all([
        getDocs(collection(db, COL.orders)),
        getDocs(collection(db, COL.users)),
      ]);
      const managers = userSnap.docs.filter((d) => {
        const r = (d.data() as { role?: string }).role;
        return r === "ADMIN" || r === "OWNER";
      }).length;
      setManagerCount(managers);

      const all: OrderRow[] = ordSnap.docs.map((d) => {
      const x = d.data() as {
        number?: string;
        title?: string | null;
        description?: string;
        details?: string | null;
        status?: string;
        completedAt?: unknown;
      };
      return {
        id: d.id,
        number: x.number ?? "",
        title: x.title ?? null,
        description: x.description ?? "",
        details: x.details ?? null,
        status: x.status ?? ORDER_IN_PRODUCTION,
        completedAt: x.completedAt,
      };
    });
    setActive(
      all
        .filter((o) => o.status === ORDER_IN_PRODUCTION)
        .sort((a, b) => a.number.localeCompare(b.number)),
    );
    const doneList = all
      .filter((o) => o.status === ORDER_DONE)
      .sort((a, b) => {
        const ta =
          a.completedAt &&
          typeof a.completedAt === "object" &&
          "toMillis" in (a.completedAt as object)
            ? (a.completedAt as { toMillis: () => number }).toMillis()
            : 0;
        const tb =
          b.completedAt &&
          typeof b.completedAt === "object" &&
          "toMillis" in (b.completedAt as object)
            ? (b.completedAt as { toMillis: () => number }).toMillis()
            : 0;
        return tb - ta;
      })
      .slice(0, 100);
      setDone(doneList);
    } catch (e) {
      setActive([]);
      setDone([]);
      setManagerCount(0);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити замовлення.");
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Замовлення</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Замовлення у виробництві та архів. Дані з Firestore.
        </p>
        {loadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
        {managerCount === 0 ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-accent-soft px-3 py-2 text-sm text-foreground">
            Додайте email у <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_WORKSHOP_ADMIN_EMAILS</code> або{" "}
            <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_WORKSHOP_OWNER_EMAILS</code> у{" "}
            <code className="rounded bg-white/80 px-1">.env.local</code>, перезапустіть dev-сервер і увійдіть знову.
          </p>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">У виробництві ({active.length})</h2>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Немає замовлень у виробництві.{" "}
            <Link href="/dashboard/admin/orders" className="font-medium text-accent hover:underline">
              Керування замовленнями
            </Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="font-semibold text-foreground">
                  <span className="tabular-nums">{o.number}</span>
                  {o.title ? <span className="ml-2 text-sm font-normal text-muted">— {o.title}</span> : null}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{o.description}</p>
                {o.details ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                    <span className="font-medium text-foreground">Додатково: </span>
                    {o.details}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Архів ({done.length})</h2>
        {done.length === 0 ? (
          <p className="text-sm text-muted">Ще немає завершених замовлень.</p>
        ) : (
          <ul className="space-y-2">
            {done.map((o) => {
              const closed =
                o.completedAt &&
                typeof o.completedAt === "object" &&
                "toDate" in o.completedAt &&
                typeof (o.completedAt as { toDate: () => Date }).toDate === "function"
                  ? formatDateTime((o.completedAt as { toDate: () => Date }).toDate())
                  : null;
              return (
                <li
                  key={o.id}
                  className="rounded-lg border border-border bg-card/80 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-foreground tabular-nums">{o.number}</span>
                  {o.title ? <span className="text-muted"> — {o.title}</span> : null}
                  {closed ? <span className="ml-2 text-muted">· {closed}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
