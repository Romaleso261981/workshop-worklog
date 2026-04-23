"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { collection, getDocs } from "firebase/firestore";
import { formatDurationMsUk } from "@/lib/format";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function toMillis(ts: unknown): number | null {
  if (ts && typeof ts === "object" && "toMillis" in ts && typeof (ts as { toMillis: () => number }).toMillis === "function") {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}

type Agg = { userId: string; displayName: string; totalMs: number; closedShifts: number };

export default function AdminWorkHoursPage() {
  const [rows, setRows] = useState<Agg[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const [weSnap, uSnap] = await Promise.all([
        getDocs(collection(db, COL.workEntries)),
        getDocs(collection(db, COL.users)),
      ]);
      const userMap = Object.fromEntries(
        uSnap.docs.map((d) => {
          const x = d.data() as { displayName?: string; email?: string };
          const name = (x.displayName ?? "").trim() || (x.email ?? "").trim() || d.id;
          return [d.id, name];
        }),
      );

      const acc = new Map<string, { totalMs: number; closedShifts: number }>();
      for (const d of weSnap.docs) {
        const x = d.data() as { userId?: string; startedAt?: unknown; endedAt?: unknown };
        const uid = x.userId ?? "";
        if (!uid) continue;
        const s = toMillis(x.startedAt);
        const e = toMillis(x.endedAt);
        if (s == null || e == null || e <= s) continue;
        const cur = acc.get(uid) ?? { totalMs: 0, closedShifts: 0 };
        cur.totalMs += e - s;
        cur.closedShifts += 1;
        acc.set(uid, cur);
      }

      const list: Agg[] = [...acc.entries()].map(([userId, v]) => ({
        userId,
        displayName: (userMap[userId] && String(userMap[userId]).trim()) || userId,
        totalMs: v.totalMs,
        closedShifts: v.closedShifts,
      }));
      list.sort((a, b) => b.totalMs - a.totalMs);
      setRows(list);
    } catch (e) {
      setRows([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити дані.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalAll = useMemo(() => rows.reduce((s, r) => s + r.totalMs, 0), [rows]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
          ← Головна
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Журнал робочого часу</h1>
        <p className="mt-1 text-sm text-muted">
          Підсумок за завершеними змінами: тривалість від «Початок» до «Завершення» по кожному запису в Firestore.
          Незавершені зміни тут не враховуються. Час показано як години та хвилини (наприклад, 11 год 41 хв).
        </p>
        {loadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <p className="text-sm text-muted">
          Усього за вибіркою:{" "}
          <span className="font-medium text-foreground">{formatDurationMsUk(totalAll)}</span>
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[280px] text-left text-sm">
          <thead className="border-b border-border bg-accent-soft/40 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Працівник</th>
              <th className="px-4 py-3 tabular-nums">Завершених змін</th>
              <th className="px-4 py-3">Тривалість</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  Немає завершених змін для підрахунку.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-4 py-3 font-medium text-foreground">{r.displayName}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{r.closedShifts}</td>
                  <td className="px-4 py-3 text-foreground">{formatDurationMsUk(r.totalMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
