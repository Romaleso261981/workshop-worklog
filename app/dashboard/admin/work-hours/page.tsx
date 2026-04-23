"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { formatDateTime, formatDurationMsUk } from "@/lib/format";
import { isPaintStage, stageLabel } from "@/lib/pipeline";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function toMillis(ts: unknown): number | null {
  if (
    ts &&
    typeof ts === "object" &&
    "toMillis" in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === "function"
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function workSummaryFromEntry(x: {
  phase: string;
  beforeOrderNotes?: string | null;
  paintingColors?: string | null;
  paintingMaterials?: string | null;
}): string {
  const paint = isPaintStage(x.phase);
  if (paint && x.paintingMaterials?.trim()) {
    return x.paintingMaterials.trim();
  }
  if (paint && x.paintingColors) {
    try {
      const data = JSON.parse(x.paintingColors) as unknown;
      if (Array.isArray(data)) {
        const bits = data
          .filter(
            (row): row is { color: string; amount: string } =>
              typeof row === "object" &&
              row !== null &&
              typeof (row as { color?: unknown }).color === "string" &&
              typeof (row as { amount?: unknown }).amount === "string",
          )
          .map((row) => `${row.color} — ${row.amount}`);
        if (bits.length) return bits.join("; ");
      }
    } catch {
      /* ignore */
    }
  }
  const n = x.beforeOrderNotes?.trim();
  if (n) return n;
  return paint ? "Фарбування (без текстового опису)" : "—";
}

type Agg = { userId: string; displayName: string; totalMs: number; closedShifts: number };

type ShiftDetailRow = {
  id: string;
  userId: string;
  startedMs: number;
  endedMs: number;
  durationMs: number;
  orderId: string;
  orderNumber: string;
  orderTitle: string | null;
  phase: string;
  phaseLabel: string;
  workSummary: string;
};

type DayRollup = {
  dateKey: string;
  dateLabel: string;
  totalMs: number;
  shiftCount: number;
};

export default function AdminWorkHoursPage() {
  const [rows, setRows] = useState<Agg[]>([]);
  const [shiftDetails, setShiftDetails] = useState<ShiftDetailRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const [weSnap, uSnap, ordSnap] = await Promise.all([
        getDocs(collection(db, COL.workEntries)),
        getDocs(collection(db, COL.users)),
        getDocs(collection(db, COL.orders)),
      ]);

      const userMap = Object.fromEntries(
        uSnap.docs.map((d) => {
          const x = d.data() as { displayName?: string; email?: string };
          const name = (x.displayName ?? "").trim() || (x.email ?? "").trim() || d.id;
          return [d.id, name];
        }),
      );

      const orderMeta = Object.fromEntries(
        ordSnap.docs.map((d) => {
          const x = d.data() as { number?: string; title?: string | null };
          return [d.id, { number: x.number ?? "", title: x.title ?? null }];
        }),
      );

      const acc = new Map<string, { totalMs: number; closedShifts: number }>();
      const details: ShiftDetailRow[] = [];

      for (const d of weSnap.docs) {
        const x = d.data() as {
          userId?: string;
          orderId?: string;
          orderNumber?: string;
          phase?: string;
          startedAt?: unknown;
          endedAt?: unknown;
          beforeOrderNotes?: string | null;
          paintingColors?: string | null;
          paintingMaterials?: string | null;
        };
        const uid = x.userId ?? "";
        if (!uid) continue;
        const s = toMillis(x.startedAt);
        const e = toMillis(x.endedAt);
        if (s == null || e == null || e <= s) continue;

        const cur = acc.get(uid) ?? { totalMs: 0, closedShifts: 0 };
        cur.totalMs += e - s;
        cur.closedShifts += 1;
        acc.set(uid, cur);

        const oid = x.orderId ?? "";
        const om = orderMeta[oid] as { number: string; title: string | null } | undefined;
        const phase = x.phase ?? "";
        details.push({
          id: d.id,
          userId: uid,
          startedMs: s,
          endedMs: e,
          durationMs: e - s,
          orderId: oid,
          orderNumber: x.orderNumber ?? om?.number ?? "",
          orderTitle: om?.title ?? null,
          phase,
          phaseLabel: stageLabel(phase),
          workSummary: workSummaryFromEntry({
            phase,
            beforeOrderNotes: x.beforeOrderNotes,
            paintingColors: x.paintingColors,
            paintingMaterials: x.paintingMaterials,
          }),
        });
      }

      details.sort((a, b) => b.startedMs - a.startedMs);

      const list: Agg[] = [...acc.entries()].map(([userId, v]) => ({
        userId,
        displayName: (userMap[userId] && String(userMap[userId]).trim()) || userId,
        totalMs: v.totalMs,
        closedShifts: v.closedShifts,
      }));
      list.sort((a, b) => b.totalMs - a.totalMs);

      setRows(list);
      setShiftDetails(details);
      setSelectedUserId((prev) => {
        if (prev && list.some((r) => r.userId === prev)) return prev;
        return null;
      });
    } catch (e) {
      setRows([]);
      setShiftDetails([]);
      setSelectedUserId(null);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити дані.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalAll = useMemo(() => rows.reduce((s, r) => s + r.totalMs, 0), [rows]);

  const selectedAgg = useMemo(
    () => (selectedUserId ? rows.find((r) => r.userId === selectedUserId) ?? null : null),
    [rows, selectedUserId],
  );

  const shiftsForSelected = useMemo(
    () => (selectedUserId ? shiftDetails.filter((s) => s.userId === selectedUserId) : []),
    [shiftDetails, selectedUserId],
  );

  const daysForSelected = useMemo((): DayRollup[] => {
    if (!selectedUserId) return [];
    const map = new Map<string, { totalMs: number; shiftCount: number; sample: Date }>();
    for (const s of shiftsForSelected) {
      const d = new Date(s.startedMs);
      const key = ymdLocal(d);
      const cur = map.get(key) ?? { totalMs: 0, shiftCount: 0, sample: d };
      cur.totalMs += s.durationMs;
      cur.shiftCount += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([dateKey, v]) => ({
        dateKey,
        dateLabel: v.sample.toLocaleDateString("uk-UA", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        totalMs: v.totalMs,
        shiftCount: v.shiftCount,
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [selectedUserId, shiftsForSelected]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
          ← Головна
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Журнал робочого часу</h1>
        <p className="mt-1 text-sm text-muted">
          Підсумок за завершеними змінами: тривалість від «Початок» до «Завершення» по кожному запису в Firestore.
          Незавершені зміни тут не враховуються. Час показано як години та хвилини (наприклад, 11 год 41 хв). Натисніть
          на рядок працівника, щоб відкрити деталі: дні роботи, зміни та що робив.
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
                <tr
                  key={r.userId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedUserId(r.userId)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSelectedUserId(r.userId);
                    }
                  }}
                  className={`cursor-pointer transition hover:bg-accent-soft/50 ${
                    selectedUserId === r.userId ? "bg-accent-soft/60 ring-1 ring-inset ring-accent/25" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{r.displayName}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">{r.closedShifts}</td>
                  <td className="px-4 py-3 text-foreground">{formatDurationMsUk(r.totalMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedUserId && selectedAgg ? (
        <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Деталі: {selectedAgg.displayName}</h2>
              <p className="mt-1 text-sm text-muted">
                Усього відпрацьовано:{" "}
                <span className="font-medium text-foreground">{formatDurationMsUk(selectedAgg.totalMs)}</span>
                {" · "}
                завершених змін:{" "}
                <span className="font-medium text-foreground tabular-nums">{selectedAgg.closedShifts}</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                Різних календарних днів із змінами:{" "}
                <span className="font-medium text-foreground tabular-nums">{daysForSelected.length}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-zinc-50"
            >
              Закрити деталі
            </button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Дні, коли працював</h3>
            {daysForSelected.length === 0 ? (
              <p className="text-sm text-muted">Немає записів.</p>
            ) : (
              <ul className="space-y-2 rounded-xl border border-border divide-y divide-border">
                {daysForSelected.map((day) => (
                  <li key={day.dateKey} className="px-4 py-3 text-sm">
                    <p className="font-medium text-foreground">{day.dateLabel}</p>
                    <p className="mt-1 text-xs text-muted">
                      На цей день: {formatDurationMsUk(day.totalMs)} · змін:{" "}
                      <span className="tabular-nums">{day.shiftCount}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Усі зміни (від новіших)</h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-accent-soft/40 text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">День</th>
                    <th className="px-3 py-2">Початок</th>
                    <th className="px-3 py-2">Кінець</th>
                    <th className="px-3 py-2">Тривалість</th>
                    <th className="px-3 py-2">Замовлення</th>
                    <th className="px-3 py-2">Етап</th>
                    <th className="px-3 py-2">Що робив</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shiftsForSelected.map((s) => {
                    const startD = new Date(s.startedMs);
                    const endD = new Date(s.endedMs);
                    const dayLine = startD.toLocaleDateString("uk-UA", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    });
                    return (
                      <tr key={s.id}>
                        <td className="px-3 py-2 text-muted">{dayLine}</td>
                        <td className="px-3 py-2 tabular-nums text-muted">{formatDateTime(startD)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted">{formatDateTime(endD)}</td>
                        <td className="px-3 py-2 tabular-nums text-foreground">{formatDurationMsUk(s.durationMs)}</td>
                        <td className="px-3 py-2">
                          {s.orderId ? (
                            <Link
                              href={`/dashboard/orders/${s.orderId}`}
                              className="font-medium text-accent underline-offset-2 hover:underline"
                            >
                              <span className="tabular-nums">{s.orderNumber}</span>
                              {s.orderTitle ? <span className="text-muted"> — {s.orderTitle}</span> : null}
                            </Link>
                          ) : (
                            <span className="tabular-nums text-foreground">{s.orderNumber || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground">{s.phaseLabel}</td>
                        <td className="px-3 py-2 whitespace-pre-wrap text-muted">{s.workSummary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
