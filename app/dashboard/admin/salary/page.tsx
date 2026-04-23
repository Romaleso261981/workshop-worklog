"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { formatDurationMsUk } from "@/lib/format";
import type { AppRole } from "@/lib/order-manager-role";
import { formatPurchaseMoney, parseMoneyAmountInput } from "@/lib/material-categories";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
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

type EmployeeRow = {
  userId: string;
  displayName: string;
  email: string;
  role: AppRole;
};

function roleLabelUk(role: AppRole): string {
  if (role === "OWNER") return "Власник";
  if (role === "ADMIN") return "Адмін";
  return "Працівник";
}

function parseNormHours(raw: string): number | null {
  const s = String(raw).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  return n;
}

/** Нарахування: денна ставка × (фактичні години / норма годин на день). */
function earnedFromWorkMs(totalMs: number, daily: number, normHours: number): number {
  if (totalMs <= 0 || daily <= 0 || normHours <= 0) return 0;
  const normMs = normHours * 3_600_000;
  return (totalMs / normMs) * daily;
}

export default function AdminSalaryPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [totalsMs, setTotalsMs] = useState<Record<string, number>>({});
  const [draftDaily, setDraftDaily] = useState<Record<string, string>>({});
  const [draftNorm, setDraftNorm] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ratesHint, setRatesHint] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setRatesHint(null);
    setSaveError(null);
    try {
      const db = getFirebaseDb();
      const [uSnap, weSnap] = await Promise.all([
        getDocs(collection(db, COL.users)),
        getDocs(collection(db, COL.workEntries)),
      ]);

      const totals: Record<string, number> = {};
      for (const d of weSnap.docs) {
        const x = d.data() as { userId?: string; startedAt?: unknown; endedAt?: unknown };
        const uid = x.userId ?? "";
        if (!uid) continue;
        const s = toMillis(x.startedAt);
        const e = toMillis(x.endedAt);
        if (s == null || e == null || e <= s) continue;
        totals[uid] = (totals[uid] ?? 0) + (e - s);
      }
      setTotalsMs(totals);

      const dailyDraft: Record<string, string> = {};
      const normDraft: Record<string, string> = {};

      try {
        const rateSnap = await getDocs(collection(db, COL.employeeSalaryRates));
        for (const d of rateSnap.docs) {
          const x = d.data() as { dailyRateUah?: unknown; normHoursPerDay?: unknown };
          const daily =
            typeof x.dailyRateUah === "number" && Number.isFinite(x.dailyRateUah) && x.dailyRateUah >= 0
              ? x.dailyRateUah
              : 0;
          let norm =
            typeof x.normHoursPerDay === "number" && Number.isFinite(x.normHoursPerDay) ? x.normHoursPerDay : 8;
          if (norm <= 0 || norm > 24) norm = 8;
          dailyDraft[d.id] = daily > 0 ? String(daily) : "";
          normDraft[d.id] = String(norm);
        }
      } catch (re) {
        if (isFirestorePermissionDenied(re)) {
          setRatesHint(
            "Ставки з колекції employeeSalaryRates не завантажено: у Firebase ще не опубліковані оновлені правила. Опублікуйте firestore.rules з репозиторію (або firebase deploy --only firestore:rules). Список людей і відпрацьований час показуються; кнопка «Зберегти» спрацює після оновлення правил.",
          );
        } else {
          setRatesHint("Не вдалося завантажити збережені ставки. Спробуйте оновити сторінку.");
        }
      }

      const list: EmployeeRow[] = [];
      for (const d of uSnap.docs) {
        const x = d.data() as { displayName?: string; email?: string; role?: string };
        const role = (x.role as AppRole) ?? "EMPLOYEE";
        const uid = d.id;
        list.push({
          userId: uid,
          displayName: (x.displayName ?? "").trim() || (x.email ?? "").trim() || uid,
          email: (x.email ?? "").trim(),
          role,
        });
        if (dailyDraft[uid] === undefined) dailyDraft[uid] = "";
        if (normDraft[uid] === undefined) normDraft[uid] = "8";
      }
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, "uk"));

      setEmployees(list);
      setDraftDaily(dailyDraft);
      setDraftNorm(normDraft);
    } catch (e) {
      setEmployees([]);
      setTotalsMs({});
      setDraftDaily({});
      setDraftNorm({});
      setRatesHint(null);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити дані.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let sum = 0;
    for (const e of employees) {
      sum += totalsMs[e.userId] ?? 0;
    }
    return sum;
  }, [employees, totalsMs]);

  async function saveRate(userId: string) {
    setSaveError(null);
    const dailyRaw = draftDaily[userId] ?? "";
    const normRaw = draftNorm[userId] ?? "8";
    const daily = parseMoneyAmountInput(dailyRaw) ?? 0;
    const norm = parseNormHours(normRaw) ?? 8;
    if (daily < 0) {
      setSaveError("Денна ставка не може бути від’ємною.");
      return;
    }
    setPendingUserId(userId);
    try {
      const db = getFirebaseDb();
      await setDoc(
        doc(db, COL.employeeSalaryRates, userId),
        {
          userId,
          dailyRateUah: daily,
          normHoursPerDay: norm,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setRatesHint(null);
    } catch (e) {
      setSaveError(
        isFirestorePermissionDenied(e)
          ? UK_FIRESTORE_RULES_HINT
          : "Не вдалося зберегти. Перевірте правила Firestore для employeeSalaryRates.",
      );
    } finally {
      setPendingUserId(null);
    }
  }

  const inputClass =
    "w-full min-w-0 rounded-lg border border-border bg-card px-2 py-1.5 text-sm tabular-nums outline-none ring-accent focus:ring-2";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
          ← Головна
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Облік зарплати</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Для кожного користувача в системі задайте денну ставку в гривнях і норму робочих годин на день (типово 8).
          Нарахування: ставка помножена на відношення{" "}
          <span className="font-medium text-foreground">фактично відпрацьованого часу</span> до цієї норми. Час
          береться з завершених змін (ті самі записи, що на сторінці «Журнал робочого часу»).
        </p>
        {loadError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
        {ratesHint && !loadError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
            {ratesHint}
          </p>
        ) : null}
        {saveError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {saveError}
          </p>
        ) : null}
      </div>

      {employees.length > 0 ? (
        <p className="text-sm text-muted">
          Усього відпрацьовано по списку:{" "}
          <span className="font-medium text-foreground">{formatDurationMsUk(totals)}</span>
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border bg-accent-soft/40 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-3">Працівник</th>
              <th className="px-3 py-3">Відпрацьовано</th>
              <th className="px-3 py-3">Норма год/день</th>
              <th className="px-3 py-3">Денна ставка, ₴</th>
              <th className="px-3 py-3">Нараховано</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Немає користувачів у колекції users.
                </td>
              </tr>
            ) : (
              employees.map((emp) => {
                const ms = totalsMs[emp.userId] ?? 0;
                const daily = parseMoneyAmountInput(draftDaily[emp.userId] ?? "") ?? 0;
                const norm = parseNormHours(draftNorm[emp.userId] ?? "8") ?? 8;
                const earned = earnedFromWorkMs(ms, daily, norm);
                const money = daily > 0 ? formatPurchaseMoney(earned, "UAH") : null;
                return (
                  <tr key={emp.userId}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{emp.displayName}</p>
                      {emp.email ? <p className="text-xs text-muted">{emp.email}</p> : null}
                      <p className="text-xs text-muted">{roleLabelUk(emp.role)}</p>
                    </td>
                    <td className="px-3 py-3 text-muted">{formatDurationMsUk(ms)}</td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draftNorm[emp.userId] ?? "8"}
                        onChange={(e) =>
                          setDraftNorm((prev) => ({
                            ...prev,
                            [emp.userId]: e.target.value,
                          }))
                        }
                        className={`${inputClass} max-w-20`}
                        aria-label="Норма годин на день"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draftDaily[emp.userId] ?? ""}
                        onChange={(e) =>
                          setDraftDaily((prev) => ({
                            ...prev,
                            [emp.userId]: e.target.value,
                          }))
                        }
                        placeholder="0"
                        className={`${inputClass} max-w-28`}
                        aria-label="Денна ставка в гривнях"
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-foreground">{money ?? "—"}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={pendingUserId === emp.userId}
                        onClick={() => void saveRate(emp.userId)}
                        className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {pendingUserId === emp.userId ? "…" : "Зберегти"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
