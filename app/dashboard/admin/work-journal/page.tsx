"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { formatDateTime } from "@/lib/format";
import { isPaintStage, stageLabel } from "@/lib/pipeline";
import { WorkJournalPagination, WORK_JOURNAL_PAGE_SIZE } from "@/components/work-journal-pagination";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Для `<input type="month" />` (локальний рік-місяць). */
function formatYmLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function timeRangeForMonthYm(ym: string): { startMs: number; endMs: number } | null {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, mo] = ym.split("-").map(Number);
  if (!y || mo < 1 || mo > 12) return null;
  const startMs = new Date(y, mo - 1, 1, 0, 0, 0, 0).getTime();
  const endMs = new Date(y, mo, 0, 23, 59, 59, 999).getTime();
  return { startMs, endMs };
}

function parseLocalDayStartMs(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseLocalDayEndMs(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
  return Number.isFinite(t) ? t : null;
}

type PeriodPreset = "all" | "month" | "year" | "custom";

function timeRangeForPreset(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
  selectedMonthYm: string,
): { startMs: number; endMs: number } | null {
  const now = new Date();
  if (preset === "all") return null;
  if (preset === "month") {
    const r = timeRangeForMonthYm(selectedMonthYm);
    if (r) return r;
    const fallback = timeRangeForMonthYm(formatYmLocal(now));
    return fallback ?? { startMs: now.getTime(), endMs: now.getTime() };
  }
  if (preset === "year") {
    const y = now.getFullYear();
    return {
      startMs: new Date(y, 0, 1, 0, 0, 0, 0).getTime(),
      endMs: new Date(y, 11, 31, 23, 59, 59, 999).getTime(),
    };
  }
  const a = parseLocalDayStartMs(customFrom);
  const b = parseLocalDayEndMs(customTo);
  if (a == null || b == null) return null;
  if (a <= b) return { startMs: a, endMs: b };
  return { startMs: b, endMs: a };
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

type WorkerOption = { uid: string; name: string };

export default function AdminWorkJournalPage() {
  const [baseRows, setBaseRows] = useState<Row[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [workerId, setWorkerId] = useState("");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("month");
  const [selectedMonthYm, setSelectedMonthYm] = useState(() => formatYmLocal(new Date()));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(0);

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

      const workerOpts: WorkerOption[] = uSnap.docs
        .map((d) => {
          const x = d.data() as { displayName?: string; email?: string };
          const name = (x.displayName ?? "").trim() || (x.email ?? "").trim() || d.id;
          return { uid: d.id, name };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "uk"));

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
        const ta = toMillis(a.startedAt) ?? 0;
        const tb = toMillis(b.startedAt) ?? 0;
        return tb - ta;
      });

      setBaseRows(list);
      setWorkers(workerOpts);
    } catch (e) {
      setBaseRows([]);
      setWorkers([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити журнал.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const timeRange = useMemo(
    () => timeRangeForPreset(periodPreset, customFrom, customTo, selectedMonthYm),
    [periodPreset, customFrom, customTo, selectedMonthYm],
  );

  const selectedMonthLabel = useMemo(() => {
    const r = timeRangeForMonthYm(selectedMonthYm);
    if (!r) return "";
    const d = new Date(r.startMs);
    return d.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  }, [selectedMonthYm]);

  const customRangeIncomplete =
    periodPreset === "custom" && (customFrom.trim() === "" || customTo.trim() === "");

  const filteredRows = useMemo(() => {
    return baseRows.filter((row) => {
      if (workerId && row.userId !== workerId) return false;
      if (periodPreset === "custom" && customRangeIncomplete) return true;
      if (!timeRange) return true;
      const t = toMillis(row.startedAt);
      if (t == null) return false;
      return t >= timeRange.startMs && t <= timeRange.endMs;
    });
  }, [baseRows, workerId, timeRange, periodPreset, customRangeIncomplete]);

  useEffect(() => {
    setPage(0);
  }, [workerId, periodPreset, customFrom, customTo, selectedMonthYm]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredRows.length / WORK_JOURNAL_PAGE_SIZE) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [filteredRows.length, page]);

  const pagedRows = useMemo(() => {
    const start = page * WORK_JOURNAL_PAGE_SIZE;
    return filteredRows.slice(start, start + WORK_JOURNAL_PAGE_SIZE);
  }, [filteredRows, page]);

  const selectClass =
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
          ← Головна
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Журнал робіт</h1>
        <p className="mt-1 text-sm text-muted">
          Оберіть працівника та період — показуємо записи за часом початку зміни (новіші зверху). У списку по{" "}
          {WORK_JOURNAL_PAGE_SIZE} записів на сторінку, решта — через пагінацію внизу.
        </p>
        {loadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Фільтри</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="wj-worker">
              Працівник
            </label>
            <select
              id="wj-worker"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className={selectClass}
            >
              <option value="">Усі працівники</option>
              {workers.map((w) => (
                <option key={w.uid} value={w.uid}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="wj-period">
              Період
            </label>
            <select
              id="wj-period"
              value={periodPreset}
              onChange={(e) => {
                const v = e.target.value as PeriodPreset;
                setPeriodPreset(v);
                if (v === "month") {
                  setSelectedMonthYm((prev) => (timeRangeForMonthYm(prev) ? prev : formatYmLocal(new Date())));
                }
                if (v === "custom") {
                  const t = new Date();
                  setCustomFrom((prev) => prev || formatYmdLocal(new Date(t.getFullYear(), t.getMonth(), 1)));
                  setCustomTo((prev) => prev || formatYmdLocal(t));
                }
              }}
              className={selectClass}
            >
              <option value="all">Усі дати</option>
              <option value="month">Один місяць (календар)</option>
              <option value="year">Поточний рік</option>
              <option value="custom">Свій період</option>
            </select>
          </div>
        </div>
        {periodPreset === "month" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="wj-month">
              Оберіть місяць
            </label>
            <input
              id="wj-month"
              type="month"
              value={selectedMonthYm}
              onChange={(e) => setSelectedMonthYm(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2 sm:max-w-sm"
            />
            {selectedMonthLabel ? (
              <p className="mt-1 text-xs text-muted">{selectedMonthLabel}</p>
            ) : null}
          </div>
        ) : null}
        {periodPreset === "custom" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="wj-from">
                Від (дата)
              </label>
              <input
                id="wj-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="wj-to">
                До (дата)
              </label>
              <input
                id="wj-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              />
            </div>
          </div>
        ) : null}
        {periodPreset === "custom" && customRangeIncomplete ? (
          <p className="text-sm text-muted">Щоб обмежити період, оберіть обидві дати. Поки що показано всі дати.</p>
        ) : null}
        <p className="text-sm text-muted">
          Знайдено записів: <span className="font-medium text-foreground">{filteredRows.length}</span>
          {baseRows.length > 0 ? (
            <>
              {" "}
              (усього в базі: <span className="tabular-nums">{baseRows.length}</span>)
            </>
          ) : null}
        </p>
      </section>

      <ul className="space-y-3">
        {filteredRows.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted">
            Немає записів за обраними умовами.
          </li>
        ) : (
          pagedRows.map((e) => {
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

      <WorkJournalPagination page={page} total={filteredRows.length} onPageChange={setPage} />
    </div>
  );
}
