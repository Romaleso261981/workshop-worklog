"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { canManageOrders } from "@/lib/order-manager-role";
import { COL } from "@/lib/firestore/collections";
import { finishActiveWorkEntryFirestore } from "@/lib/firestore/shift-ops";
import { formatDateTime } from "@/lib/format";
import { stageLabel } from "@/lib/pipeline";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ActiveEntry = {
  id: string;
  phase: string;
  orderNumber: string;
  orderId: string | null;
  startedAt: unknown;
};

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState<ActiveEntry | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || loading) {
      if (!user) setActive(null);
      return;
    }
    const db = getFirebaseDb();
    const q = query(
      collection(db, COL.workEntries),
      where("userId", "==", user.uid),
      where("endedAt", "==", null),
    );
    return onSnapshot(
      q,
      async (snap) => {
        if (snap.empty) {
          setActive(null);
          return;
        }
        const d = snap.docs[0];
        const data = d.data() as {
          phase: string;
          orderNumber?: string;
          orderId?: string;
          startedAt?: unknown;
        };
        let orderNumber = data.orderNumber ?? "";
        if (!orderNumber && data.orderId) {
          const os = await getDoc(doc(db, COL.orders, data.orderId));
          if (os.exists()) {
            orderNumber = (os.data() as { number?: string }).number ?? "";
          }
        }
        setActive({
          id: d.id,
          phase: data.phase,
          orderNumber,
          orderId: data.orderId ?? null,
          startedAt: data.startedAt,
        });
      },
      () => {
        setActive(null);
      },
    );
  }, [user, loading]);

  if (loading || !user || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">
        Завантаження…
      </div>
    );
  }

  const navLink =
    "rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-foreground";
  const processNav = canManageOrders(profile.role);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Workshop Worklog
            </span>
            <span className="font-semibold text-foreground">{profile.displayName}</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            <Link href="/dashboard" className={navLink}>
              Головна
            </Link>
            {processNav ? (
              <>
                <Link href="/dashboard/admin/orders" className={`${navLink} text-accent`}>
                  Замовлення
                </Link>
                <Link href="/dashboard/admin/materials" className={`${navLink} text-accent`}>
                  Матеріали
                </Link>
                <Link href="/dashboard/admin/work-journal" className={navLink}>
                  Журнал робіт
                </Link>
                <Link href="/dashboard/admin/work-hours" className={navLink}>
                  Робочий час
                </Link>
                <Link href="/dashboard/admin/salary" className={navLink}>
                  Зарплата
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard/shift" className={navLink}>
                  Зміна
                </Link>
                <Link href="/dashboard/journal" className={navLink}>
                  Журнал
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => signOut().then(() => router.replace("/login"))}
              className="ml-1 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-zinc-100 hover:text-foreground"
            >
              Вийти
            </button>
          </nav>
        </div>
      </header>

      {!processNav && active ? (
        <div className="border-b border-amber-200 bg-accent-soft">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                Активна зміна: {stageLabel(active.phase)} · замовлення{" "}
                <span className="tabular-nums">{active.orderNumber}</span>
              </p>
              {active.orderId ? (
                <p className="mt-1">
                  <Link
                    href={`/dashboard/orders/${active.orderId}`}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Картка замовлення та матеріали →
                  </Link>
                </p>
              ) : null}
              <p className="text-muted">
                Почато:{" "}
                {active.startedAt &&
                typeof active.startedAt === "object" &&
                "toDate" in active.startedAt &&
                typeof (active.startedAt as { toDate: () => Date }).toDate === "function"
                  ? formatDateTime((active.startedAt as { toDate: () => Date }).toDate())
                  : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                finishActiveWorkEntryFirestore(active.id).then(() => {
                  router.refresh();
                })
              }
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
            >
              Завершити зміну
            </button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
