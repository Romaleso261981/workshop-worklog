"use client";

import { AdminOrderForm } from "@/components/admin-order-form";
import { OrderPhotoStrip } from "@/components/order-photo-strip";
import type { OrderPhotosEditorHandle } from "@/components/order-photos-editor";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { AdminOrderDoc } from "@/lib/admin-order-doc";
import { orderPayloadFromForm } from "@/lib/admin-order-payload";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format";
import { formatPurchaseMoney, parseMoneyAmountInput } from "@/lib/material-categories";
import { normalizeOrderPhotoUrls } from "@/lib/order-photos";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type OrdersPeriodMode = "year" | "month" | "custom";

function createdAtDate(v: unknown): Date | null {
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

export default function AdminOrdersPage() {
  const ORDERS_PAGE_SIZE = 4;
  const photoFlushRef = useRef<OrderPhotosEditorHandle>(null);
  const [active, setActive] = useState<AdminOrderDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(0);
  const [periodMode, setPeriodMode] = useState<OrdersPeriodMode>("year");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formInstanceId, setFormInstanceId] = useState(0);

  const draft = useMemo(() => (editingId ? active.find((o) => o.id === editingId) ?? null : null), [active, editingId]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const snap = await getDocs(collection(db, COL.orders));
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
      setActive(
        all
          .filter((o) => o.status === ORDER_IN_PRODUCTION)
          .sort((a, b) => a.number.localeCompare(b.number)),
      );
    } catch (e) {
      setActive([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити замовлення.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [active.length]);

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

  function openAdd() {
    setFormMode("add");
    setEditingId(null);
    setFormInstanceId((i) => i + 1);
    setError(null);
  }

  function openEdit(o: AdminOrderDoc) {
    setFormMode("edit");
    setEditingId(o.id);
    setFormInstanceId((i) => i + 1);
    setError(null);
  }

  function saveOrder(fd: FormData) {
    setError(null);
    if (!formMode) return;
    const payload = orderPayloadFromForm(fd);
    if (!payload.number || !payload.description) {
      setError("Номер і опис обов’язкові.");
      return;
    }

    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        const dupSnap = await getDocs(
          query(collection(db, COL.orders), where("number", "==", payload.number)),
        );
        const conflict =
          formMode === "edit" && editingId
            ? dupSnap.docs.filter((d) => d.id !== editingId)
            : dupSnap.docs;
        if (conflict.length > 0) {
          setError("Такий номер замовлення уже існує.");
          return;
        }

        if (formMode === "edit" && editingId) {
          let photoUrls: string[] = [];
          try {
            photoUrls = (await photoFlushRef.current?.flush(editingId)) ?? [];
          } catch {
            setError("Не вдалося оновити фото в Storage. Перевірте правила Storage і bucket.");
            return;
          }
          await updateDoc(doc(db, COL.orders, editingId), {
            ...payload,
            photoUrls,
            updatedAt: serverTimestamp(),
          });
        } else {
          const docRef = await addDoc(collection(db, COL.orders), {
            ...payload,
            photoUrls: [],
            status: ORDER_IN_PRODUCTION,
            createdAt: serverTimestamp(),
          });
          let photoUrls: string[] = [];
          try {
            photoUrls = (await photoFlushRef.current?.flush(docRef.id)) ?? [];
          } catch {
            setError(
              "Замовлення створено, але фото не завантажились (Storage). Відкрийте замовлення й додайте фото знову або перевірте правила Storage.",
            );
            await load();
            closeForm();
            return;
          }
          await updateDoc(docRef, { photoUrls });
        }
        await load();
        closeForm();
      } catch {
        setError("Не вдалося зберегти (перевірте правила Firestore).");
      } finally {
        setPending(false);
      }
    })();
  }

  function completeOrder(orderId: string) {
    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        await updateDoc(doc(db, COL.orders, orderId), {
          status: ORDER_DONE,
          completedAt: serverTimestamp(),
        });
        if (editingId === orderId) closeForm();
        await load();
      } finally {
        setPending(false);
      }
    })();
  }

  function orderMetaLines(o: AdminOrderDoc) {
    const lines: string[] = [];
    if (o.status === ORDER_DONE && o.completedAt) {
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

  const totalPages = Math.max(1, Math.ceil(active.length / ORDERS_PAGE_SIZE));
  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const o of active) {
      const d = createdAtDate(o.createdAt);
      if (d) years.add(d.getFullYear());
    }
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [active]);

  useEffect(() => {
    if (yearOptions.length === 0) return;
    if (!yearOptions.includes(yearFilter)) {
      setYearFilter(yearOptions[0]);
    }
  }, [yearOptions, yearFilter]);

  const filteredActive = useMemo(() => {
    const startCustom = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const endCustom = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
    return active.filter((o) => {
      const d = createdAtDate(o.createdAt);
      if (!d) return false;
      if (periodMode === "year") return d.getFullYear() === yearFilter;
      if (periodMode === "month") {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return monthKey === monthFilter;
      }
      if (startCustom && d < startCustom) return false;
      if (endCustom && d > endCustom) return false;
      return true;
    });
  }, [active, periodMode, yearFilter, monthFilter, customFrom, customTo]);

  const filteredTotalPages = Math.max(1, Math.ceil(filteredActive.length / ORDERS_PAGE_SIZE));
  const safePage = Math.min(page, filteredTotalPages - 1);
  const visibleOrders = filteredActive.slice(
    safePage * ORDERS_PAGE_SIZE,
    safePage * ORDERS_PAGE_SIZE + ORDERS_PAGE_SIZE,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Замовлення (керування)</h1>
          {loadError ? (
            <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {loadError}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
          <Link
            href="/dashboard/admin/orders/archive"
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-zinc-50"
          >
            Архів
          </Link>
          <button
            type="button"
            onClick={() => (formMode ? closeForm() : openAdd())}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
          >
            {formMode ? "Закрити" : "Додати замовлення"}
          </button>
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
            aria-label={formMode === "add" ? "Нове замовлення" : "Редагування замовлення"}
            onMouseDown={(ev) => ev.stopPropagation()}
          >
            <AdminOrderForm
              ref={photoFlushRef}
              mode={formMode}
              draft={formMode === "edit" ? draft : null}
              formInstanceId={formInstanceId}
              error={error}
              pending={pending}
              onSubmit={saveOrder}
              onCancel={closeForm}
              onCompleteProduction={
                formMode === "edit" && editingId ? () => completeOrder(editingId) : undefined
              }
            />
          </div>
        </div>
      ) : null}

      <section className="flex min-h-0 flex-col space-y-3">
        <h2 className="text-lg font-semibold">Фільтр періоду</h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted" htmlFor="orders-period-mode">
                Режим періоду
              </label>
              <select
                id="orders-period-mode"
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value as OrdersPeriodMode)}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="year">За рік</option>
                <option value="month">За місяць</option>
                <option value="custom">Власний період</option>
              </select>
            </div>
            {periodMode === "year" ? (
              <div>
                <label className="mb-1 block text-xs text-muted" htmlFor="orders-year-filter">
                  Рік
                </label>
                <select
                  id="orders-year-filter"
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
                <label className="mb-1 block text-xs text-muted" htmlFor="orders-month-filter">
                  Місяць
                </label>
                <input
                  id="orders-month-filter"
                  type="month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="orders-from">
                    Від
                  </label>
                  <input
                    id="orders-from"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor="orders-to">
                    До
                  </label>
                  <input
                    id="orders-to"
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
        <h2 className="text-lg font-semibold">У виробництві ({filteredActive.length})</h2>
        {filteredActive.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Немає активних замовлень.
          </p>
        ) : (
          <>
          <ul className="space-y-3 rounded-xl border border-border bg-card/30 p-2">
            {visibleOrders.map((o) => (
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
                className={`cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition hover:bg-accent-soft/50 ${
                  formMode === "edit" && editingId === o.id ? "bg-accent-soft/40 ring-1 ring-inset ring-accent/30" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <span className="tabular-nums">{o.number}</span>
                    {o.title ? <span className="ml-2 text-sm font-normal text-muted">— {o.title}</span> : null}
                  </p>
                  {orderMetaLines(o).map((line, i) => (
                    <p key={i} className="mt-1 text-xs text-muted">
                      {line}
                    </p>
                  ))}
                  <p className="mt-2 whitespace-pre-wrap text-sm">{o.description}</p>
                  {o.details ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                      <span className="font-medium text-foreground">Додатково: </span>
                      {o.details}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted">
                    Створено:{" "}
                    {o.createdAt && typeof o.createdAt === "object" && "toDate" in o.createdAt
                      ? formatDateTime((o.createdAt as { toDate: () => Date }).toDate())
                      : "—"}
                  </p>
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
            ))}
          </ul>
          {filteredTotalPages > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-4"
              aria-label="Сторінки замовлень"
            >
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Попередня
              </button>
              <span className="text-sm text-muted">
                Сторінка <span className="font-medium tabular-nums text-foreground">{safePage + 1}</span> з{" "}
                <span className="tabular-nums">{filteredTotalPages}</span>
                <span className="ml-2 text-xs">(по {ORDERS_PAGE_SIZE} замовлення)</span>
              </span>
              <button
                type="button"
                disabled={safePage >= filteredTotalPages - 1}
                onClick={() => setPage((p) => Math.min(filteredTotalPages - 1, p + 1))}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Наступна
              </button>
            </nav>
          ) : null}
          </>
        )}
      </section>
    </div>
  );
}
