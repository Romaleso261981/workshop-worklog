"use client";

import { AdminOrderForm } from "@/components/admin-order-form";
import { OrderPhotoStrip } from "@/components/order-photo-strip";
import type { OrderPhotosEditorHandle } from "@/components/order-photos-editor";
import type { AdminOrderDoc } from "@/lib/admin-order-doc";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { formatDateTime } from "@/lib/format";
import { formatPurchaseMoney, parseMoneyAmountInput } from "@/lib/material-categories";
import { normalizeOrderPhotoUrls } from "@/lib/order-photos";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { doc, getDocs, collection, updateDoc, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ArchivePeriodMode = "year" | "month" | "custom";

function completedAtDate(v: unknown): Date | null {
  if (
    v &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}

export default function AdminOrdersArchivePage() {
  const photoFlushRef = useRef<OrderPhotosEditorHandle>(null);
  const [done, setDone] = useState<AdminOrderDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formMode, setFormMode] = useState<"edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formInstanceId, setFormInstanceId] = useState(0);
  const [periodMode, setPeriodMode] = useState<ArchivePeriodMode>("year");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const draft = useMemo(() => (editingId ? done.find((o) => o.id === editingId) ?? null : null), [done, editingId]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const snap = await getDocs(collection(db, COL.orders));
      function completedAtMillis(c: unknown): number {
        if (
          c &&
          typeof c === "object" &&
          "toMillis" in c &&
          typeof (c as { toMillis: () => number }).toMillis === "function"
        ) {
          return (c as { toMillis: () => number }).toMillis();
        }
        return 0;
      }
      const all: AdminOrderDoc[] = snap.docs.map((d) => {
        const x = d.data() as {
          number?: string;
          title?: string | null;
          description?: string;
          details?: string | null;
          status?: string;
          createdAt?: unknown;
          completedAt?: unknown;
          orderFor?: string | null;
          clientPhonePrimary?: string | null;
          totalCost?: unknown;
          totalCurrency?: string | null;
          npSettlementRef?: string | null;
          npSettlementLabel?: string | null;
          npWarehouseRef?: string | null;
          npWarehouseLabel?: string | null;
          addressNote?: string | null;
          photoUrls?: unknown;
        };
        const tc =
          typeof x.totalCost === "number" && Number.isFinite(x.totalCost)
            ? x.totalCost
            : typeof x.totalCost === "string"
              ? parseMoneyAmountInput(x.totalCost)
              : null;
        return {
          id: d.id,
          number: x.number ?? "",
          title: x.title ?? null,
          description: x.description ?? "",
          details: x.details ?? null,
          status: x.status ?? ORDER_IN_PRODUCTION,
          createdAt: x.createdAt,
          completedAt: x.completedAt,
          orderFor: x.orderFor ?? null,
          clientPhonePrimary: x.clientPhonePrimary ?? null,
          totalCost: tc,
          totalCurrency: x.totalCurrency ?? null,
          npSettlementRef: x.npSettlementRef ?? null,
          npSettlementLabel: x.npSettlementLabel ?? null,
          npWarehouseRef: x.npWarehouseRef ?? null,
          npWarehouseLabel: x.npWarehouseLabel ?? null,
          addressNote: x.addressNote ?? null,
          photoUrls: normalizeOrderPhotoUrls(x.photoUrls),
        };
      });
      setDone(
        all
          .filter((o) => o.status === ORDER_DONE)
          .sort((a, b) => {
            const ta = completedAtMillis(a.completedAt);
            const tb = completedAtMillis(b.completedAt);
            if (tb !== ta) return tb - ta;
            return b.number.localeCompare(a.number, "uk", { numeric: true });
          }),
      );
    } catch (e) {
      setDone([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити архів.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeForm = useCallback(() => {
    setFormMode(null);
    setEditingId(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (formMode === null) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [formMode, closeForm]);

  function openEdit(o: AdminOrderDoc) {
    setFormMode("edit");
    setEditingId(o.id);
    setFormInstanceId((i) => i + 1);
    setError(null);
  }

  function returnToProduction(orderId: string) {
    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        await updateDoc(doc(db, COL.orders, orderId), {
          status: ORDER_IN_PRODUCTION,
          completedAt: null,
          updatedAt: serverTimestamp(),
        });
        closeForm();
        await load();
      } finally {
        setPending(false);
      }
    })();
  }

  function orderMetaLines(o: AdminOrderDoc) {
    const lines: string[] = [];
    if (o.completedAt) {
      const closed =
        typeof o.completedAt === "object" &&
        o.completedAt !== null &&
        "toDate" in o.completedAt &&
        typeof (o.completedAt as { toDate: () => Date }).toDate === "function"
          ? formatDateTime((o.completedAt as { toDate: () => Date }).toDate())
          : null;
      if (closed) lines.push(`Закрито: ${closed}`);
    }
    if (o.orderFor) lines.push(`Для кого: ${o.orderFor}`);
    if (o.clientPhonePrimary) lines.push(`Телефон: ${o.clientPhonePrimary}`);
    const money = formatPurchaseMoney(o.totalCost ?? undefined, o.totalCurrency ?? "UAH");
    if (money) lines.push(`Вартість: ${money}`);
    if (o.npSettlementLabel) lines.push(`Населений пункт: ${o.npSettlementLabel}`);
    if (o.npWarehouseLabel) lines.push(`Відділення НП: ${o.npWarehouseLabel}`);
    if (o.addressNote) lines.push(`Доставка: ${o.addressNote}`);
    return lines;
  }

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const o of done) {
      const d = completedAtDate(o.completedAt);
      if (d) years.add(d.getFullYear());
    }
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [done]);

  useEffect(() => {
    if (yearOptions.length === 0) return;
    if (!yearOptions.includes(yearFilter)) {
      setYearFilter(yearOptions[0]);
    }
  }, [yearOptions, yearFilter]);

  const filteredDone = useMemo(() => {
    const startCustom = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const endCustom = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
    return done.filter((o) => {
      const d = completedAtDate(o.completedAt);
      if (!d) return false;
      if (periodMode === "year") {
        return d.getFullYear() === yearFilter;
      }
      if (periodMode === "month") {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return monthKey === monthFilter;
      }
      if (startCustom && d < startCustom) return false;
      if (endCustom && d > endCustom) return false;
      return true;
    });
  }, [done, periodMode, yearFilter, monthFilter, customFrom, customTo]);

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Архів замовлень</h1>
          {loadError ? (
            <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {loadError}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
          <Link
            href="/dashboard/admin/orders"
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-zinc-50"
          >
            У виробництво
          </Link>
        </div>
      </div>

      {formMode !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-10 sm:items-center sm:pt-4"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) closeForm();
          }}
        >
          <div
            className="relative max-h-[min(90vh,52rem)] w-full max-w-3xl overflow-y-auto shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Редагування замовлення"
            onMouseDown={(ev) => ev.stopPropagation()}
          >
            <AdminOrderForm
              ref={photoFlushRef}
              mode="edit"
              draft={draft}
              formInstanceId={formInstanceId}
              error={error}
              pending={pending}
              onSubmit={() => undefined}
              onCancel={closeForm}
              onReturnToProduction={editingId ? () => returnToProduction(editingId) : undefined}
              hidePrimarySubmit
            />
          </div>
        </div>
      ) : null}

      <section className="flex min-h-0 flex-col space-y-3">
        <h2 className="text-lg font-semibold">Аналітика архіву</h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted" htmlFor="archive-period-mode">
                Режим періоду
              </label>
              <select
                id="archive-period-mode"
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value as ArchivePeriodMode)}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="year">За рік</option>
                <option value="month">За місяць</option>
                <option value="custom">Власний період</option>
              </select>
            </div>
            {periodMode === "year" ? (
              <div>
                <label className="mb-1 block text-xs text-muted" htmlFor="archive-year-filter">
                  Рік
                </label>
                <select
                  id="archive-year-filter"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(Number(e.target.value))}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            ) : periodMode === "month" ? (
              <div>
                <label className="mb-1 block text-xs text-muted" htmlFor="archive-month-filter">
                  Місяць
                </label>
                <input
                  id="archive-month-filter"
                  type="month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="archive-from">
                    Від
                  </label>
                  <input
                    id="archive-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="archive-to">
                    До
                  </label>
                  <input
                    id="archive-to"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
          </div>

        </div>
      </section>

      <section className="flex min-h-0 flex-col space-y-3">
        <h2 className="text-lg font-semibold">Архів ({filteredDone.length})</h2>
        {filteredDone.length === 0 ? (
          <p className="text-sm text-muted">Поки порожньо.</p>
        ) : (
          <ul className="max-h-[min(58vh,36rem)] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card/30 py-1 pr-1 text-sm text-muted">
            {filteredDone.map((o) => {
              const meta = orderMetaLines(o);
              return (
                <li
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(o)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      openEdit(o);
                    }
                  }}
                  className={`cursor-pointer rounded-lg border border-border px-4 py-2 transition hover:bg-accent-soft/50 ${
                    formMode === "edit" && editingId === o.id ? "bg-accent-soft/40 ring-1 ring-inset ring-accent/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground tabular-nums">{o.number}</span>
                      {o.title ? ` — ${o.title}` : ""}
                      {meta.length ? <span className="mt-1 block text-xs">{meta.join(" · ")}</span> : null}
                    </div>
                    {o.photoUrls && o.photoUrls.length > 0 ? (
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <OrderPhotoStrip urls={o.photoUrls} />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
