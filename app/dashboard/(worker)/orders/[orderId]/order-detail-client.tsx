"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { OrderPhotoStrip } from "@/components/order-photo-strip";
import { formatDateTime } from "@/lib/format";
import { normalizeOrderPhotoUrls } from "@/lib/order-photos";
import {
  formatPurchaseMoney,
  materialCategoryLabel,
  parseMaterialDoc,
  parseMoneyAmountInput,
  type MaterialListItem,
} from "@/lib/material-categories";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { isPaintStage, stageLabel } from "@/lib/pipeline";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type OrderView = {
  id: string;
  number: string;
  title: string | null;
  description: string;
  details: string | null;
  status: string;
  orderFor: string | null;
  orderSubject: string | null;
  totalCost: number | null;
  totalCurrency: string | null;
  npSettlementLabel: string | null;
  npWarehouseLabel: string | null;
  addressNote: string | null;
  photoUrls: string[];
};

type IssuedRow = {
  id: string;
  materialId: string;
  materialName: string;
  materialCategory: string;
  quantity: number;
  addedByUid: string;
  addedByEmail: string | null;
  createdAt: unknown;
};

type WorkLogRow = {
  id: string;
  phaseLabel: string;
  userLabel: string;
  startedAt: unknown;
  endedAt: unknown;
  notesPreview: string | null;
};

function tsMillis(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function parseQuantity(raw: string): number | null {
  const s = String(raw).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const [orderLoading, setOrderLoading] = useState(true);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [issues, setIssues] = useState<IssuedRow[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [qtyRaw, setQtyRaw] = useState("1");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [workLog, setWorkLog] = useState<WorkLogRow[]>([]);

  const canAddMaterials = order?.status === ORDER_IN_PRODUCTION;

  const loadOrder = useCallback(async () => {
    setLoadError(null);
    setOrderLoading(true);
    try {
      const db = getFirebaseDb();
      const ref = doc(db, COL.orders, orderId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setOrder(null);
        return;
      }
      const x = snap.data() as Record<string, unknown>;
      const tc =
        typeof x.totalCost === "number" && Number.isFinite(x.totalCost)
          ? x.totalCost
          : typeof x.totalCost === "string"
            ? parseMoneyAmountInput(x.totalCost)
            : null;
      setOrder({
        id: snap.id,
        number: String(x.number ?? ""),
        title: (x.title as string | null) ?? null,
        description: String(x.description ?? ""),
        details: (x.details as string | null) ?? null,
        status: String(x.status ?? ORDER_IN_PRODUCTION),
        orderFor: (x.orderFor as string | null) ?? null,
        orderSubject: (x.orderSubject as string | null) ?? null,
        totalCost: tc,
        totalCurrency: (x.totalCurrency as string | null) ?? null,
        npSettlementLabel: (x.npSettlementLabel as string | null) ?? null,
        npWarehouseLabel: (x.npWarehouseLabel as string | null) ?? null,
        addressNote: (x.addressNote as string | null) ?? null,
        photoUrls: normalizeOrderPhotoUrls(x.photoUrls),
      });
    } catch (e) {
      setOrder(null);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити замовлення.");
    } finally {
      setOrderLoading(false);
    }
  }, [orderId]);

  const loadMaterials = useCallback(async () => {
    try {
      const db = getFirebaseDb();
      const snap = await getDocs(collection(db, COL.materials));
      const list = snap.docs.map((d) => parseMaterialDoc(d.id, d.data() as Record<string, unknown>));
      list.sort((a, b) => a.name.localeCompare(b.name, "uk"));
      setMaterials(list);
    } catch {
      setMaterials([]);
    }
  }, []);

  const loadWorkLog = useCallback(async () => {
    try {
      const db = getFirebaseDb();
      const [weSnap, uSnap] = await Promise.all([
        getDocs(query(collection(db, COL.workEntries), where("orderId", "==", orderId))),
        getDocs(collection(db, COL.users)),
      ]);
      const nameByUid = Object.fromEntries(
        uSnap.docs.map((d) => {
          const x = d.data() as { displayName?: string; email?: string };
          const label = (x.displayName ?? "").trim() || (x.email ?? "").trim() || d.id;
          return [d.id, label];
        }),
      );
      const rows: WorkLogRow[] = weSnap.docs.map((d) => {
        const x = d.data() as {
          phase?: string;
          userId?: string;
          startedAt?: unknown;
          endedAt?: unknown;
          beforeOrderNotes?: string | null;
          paintingColors?: string | null;
        };
        const phase = String(x.phase ?? "");
        let notes: string | null = x.beforeOrderNotes ?? null;
        if (isPaintStage(phase) && x.paintingColors) {
          try {
            const cols = JSON.parse(x.paintingColors) as { color?: string; amount?: string }[];
            const bit = Array.isArray(cols)
              ? cols
                  .map((c) => `${(c.color ?? "").trim()} ${(c.amount ?? "").trim()}`.trim())
                  .filter(Boolean)
                  .join("; ")
              : "";
            notes = [notes, bit].filter(Boolean).join(" · ") || null;
          } catch {
            /* ignore */
          }
        }
        const long = notes && notes.length > 240 ? `${notes.slice(0, 240)}…` : notes;
        return {
          id: d.id,
          phaseLabel: stageLabel(phase),
          userLabel: nameByUid[x.userId ?? ""] ?? (x.userId ? `${x.userId.slice(0, 8)}…` : "—"),
          startedAt: x.startedAt ?? null,
          endedAt: x.endedAt ?? null,
          notesPreview: long,
        };
      });
      rows.sort((a, b) => tsMillis(b.startedAt) - tsMillis(a.startedAt));
      setWorkLog(rows);
    } catch {
      setWorkLog([]);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    void loadWorkLog();
  }, [loadWorkLog]);

  useEffect(() => {
    if (!user) return;
    const db = getFirebaseDb();
    const q = query(
      collection(db, COL.orders, orderId, COL.orderIssuedMaterials),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows: IssuedRow[] = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          const qn = x.quantity;
          const quantity =
            typeof qn === "number" && Number.isFinite(qn)
              ? qn
              : typeof qn === "string"
                ? Number(qn)
                : 0;
          return {
            id: d.id,
            materialId: String(x.materialId ?? ""),
            materialName: String(x.materialName ?? ""),
            materialCategory: String(x.materialCategory ?? ""),
            quantity: Number.isFinite(quantity) ? quantity : 0,
            addedByUid: String(x.addedByUid ?? ""),
            addedByEmail: (x.addedByEmail as string | null) ?? null,
            createdAt: x.createdAt,
          };
        });
        setIssues(rows);
      },
      () => setIssues([]),
    );
  }, [orderId, user]);

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === materialId) ?? null,
    [materials, materialId],
  );

  async function onAdd(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    if (!user || !canAddMaterials) {
      setFormError("Додавати матеріали можна лише для замовлення у виробництві.");
      return;
    }
    if (!materialId) {
      setFormError("Оберіть матеріал зі списку.");
      return;
    }
    const qty = parseQuantity(qtyRaw);
    if (qty == null) {
      setFormError("Вкажіть кількість більше нуля (число).");
      return;
    }
    const m = materials.find((x) => x.id === materialId);
    if (!m) {
      setFormError("Матеріал не знайдено.");
      return;
    }
    setPending(true);
    try {
      const db = getFirebaseDb();
      await addDoc(collection(db, COL.orders, orderId, COL.orderIssuedMaterials), {
        materialId: m.id,
        materialName: m.name,
        materialCategory: m.category,
        quantity: qty,
        addedByUid: user.uid,
        addedByEmail: user.email ?? null,
        createdAt: serverTimestamp(),
      });
      setQtyRaw("1");
    } catch (e) {
      setFormError(
        isFirestorePermissionDenied(e)
          ? UK_FIRESTORE_RULES_HINT
          : "Не вдалося зберегти. Перевірте правила Firestore.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!user) return null;

  if (orderLoading) {
    return <p className="text-sm text-muted">Завантаження…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {loadError}
        </p>
        <Link href="/dashboard/orders" className="text-sm font-medium text-accent hover:underline">
          ← До списку замовлень
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Замовлення не знайдено.</p>
        <Link href="/dashboard/orders" className="text-sm font-medium text-accent hover:underline">
          ← До списку замовлень
        </Link>
      </div>
    );
  }

  const money = formatPurchaseMoney(order.totalCost ?? undefined, order.totalCurrency ?? "UAH");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/orders" className="text-sm font-medium text-accent hover:underline">
          ← Усі замовлення
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          <span className="tabular-nums">{order.number}</span>
          {order.title ? <span className="ml-2 text-lg font-normal text-muted">— {order.title}</span> : null}
        </h1>
        <p className="mt-1 text-xs text-muted">
          Статус:{" "}
          <span className="font-medium text-foreground">
            {order.status === ORDER_DONE ? "Завершено" : order.status === ORDER_IN_PRODUCTION ? "У виробництві" : order.status}
          </span>
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Загальна інформація</h2>
        {order.orderFor ? (
          <p className="text-sm text-muted">
            Для кого: <span className="text-foreground">{order.orderFor}</span>
          </p>
        ) : null}
        {order.orderSubject ? (
          <p className="text-sm text-muted">
            Що виготовляємо: <span className="text-foreground">{order.orderSubject}</span>
          </p>
        ) : null}
        {money ? (
          <p className="text-sm text-muted">
            Вартість: <span className="text-foreground">{money}</span>
          </p>
        ) : null}
        {order.npSettlementLabel ? (
          <p className="text-sm text-muted">
            Населений пункт: <span className="text-foreground">{order.npSettlementLabel}</span>
          </p>
        ) : null}
        {order.npWarehouseLabel ? (
          <p className="text-sm text-muted">
            Відділення НП: <span className="text-foreground">{order.npWarehouseLabel}</span>
          </p>
        ) : null}
        {order.addressNote ? (
          <p className="text-sm text-muted">
            Доставка: <span className="text-foreground">{order.addressNote}</span>
          </p>
        ) : null}
        <div>
          <p className="text-sm font-medium text-foreground">Опис</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{order.description}</p>
        </div>
        {order.details ? (
          <div>
            <p className="text-sm font-medium text-foreground">Додатково</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{order.details}</p>
          </div>
        ) : null}
        {order.photoUrls.length > 0 ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Фото</p>
            <p className="mt-1 text-xs text-muted">Натисніть мініатюру, щоб переглянути на весь екран.</p>
            <div className="mt-2">
              <OrderPhotoStrip urls={order.photoUrls} />
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Деталі</h2>
        <p className="text-sm text-muted">
          Етапи, хто вів зміну, початок і кінець, примітки — по рядку на кожну зміну. Для закритих замовлень тут уся
          історія.
        </p>
        {workLog.length === 0 ? (
          <p className="text-sm text-muted">Поки немає записів по цьому замовленню.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {workLog.map((row) => {
              const start =
                row.startedAt &&
                typeof row.startedAt === "object" &&
                "toDate" in row.startedAt &&
                typeof (row.startedAt as { toDate: () => Date }).toDate === "function"
                  ? formatDateTime((row.startedAt as { toDate: () => Date }).toDate())
                  : "—";
              const end =
                row.endedAt &&
                typeof row.endedAt === "object" &&
                "toDate" in row.endedAt &&
                typeof (row.endedAt as { toDate: () => Date }).toDate === "function"
                  ? formatDateTime((row.endedAt as { toDate: () => Date }).toDate())
                  : null;
              return (
                <li key={row.id} className="px-3 py-2.5 text-sm">
                  <p className="font-medium text-foreground">
                    {row.phaseLabel}
                    <span className="ml-2 font-normal text-muted">· {row.userLabel}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {start}
                    {end ? ` → ${end}` : " → …"}
                  </p>
                  {row.notesPreview ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/90">{row.notesPreview}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Матеріали по замовленню</h2>
        <p className="text-sm text-muted">
          Оберіть позицію з довідника (його веде адміністратор на сторінці «Матеріали») і вкажіть кількість. Запис
          зберігається з вашим обліковим записом і часом.
        </p>

        {canAddMaterials ? (
          <form onSubmit={onAdd} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <label htmlFor="issue-material" className="mb-1 block text-sm font-medium text-foreground">
                Матеріал
              </label>
              <select
                id="issue-material"
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              >
                <option value="">— оберіть з довідника —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({materialCategoryLabel(m.category)})
                  </option>
                ))}
              </select>
              {selectedMaterial ? (
                <p className="mt-1 text-xs text-muted">
                  Категорія: {materialCategoryLabel(selectedMaterial.category)}
                </p>
              ) : null}
            </div>
            <div className="w-full sm:w-36">
              <label htmlFor="issue-qty" className="mb-1 block text-sm font-medium text-foreground">
                Кількість
              </label>
              <input
                id="issue-qty"
                type="text"
                inputMode="decimal"
                value={qtyRaw}
                onChange={(e) => setQtyRaw(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                placeholder="Напр. 2 або 0.5"
              />
            </div>
            <button
              type="submit"
              disabled={pending || materials.length === 0}
              className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {pending ? "Збереження…" : "Зафіксувати витрату"}
            </button>
          </form>
        ) : (
          <p className="rounded-lg border border-border bg-accent-soft/40 px-3 py-2 text-sm text-muted">
            Замовлення не у виробництві — додавати матеріали не можна (лише перегляд нижче).
          </p>
        )}

        {formError ? (
          <p className="text-sm text-red-700" role="alert">
            {formError}
          </p>
        ) : null}

        {materials.length === 0 ? (
          <p className="text-xs text-amber-900">
            Довідник матеріалів порожній. Попросіть адміністратора додати позиції в розділі «Матеріали».
          </p>
        ) : null}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Журнал доданих матеріалів</h3>
          {issues.length === 0 ? (
            <p className="text-sm text-muted">Поки немає записів.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {issues.map((row) => {
                const when =
                  row.createdAt &&
                  typeof row.createdAt === "object" &&
                  "toDate" in row.createdAt &&
                  typeof (row.createdAt as { toDate: () => Date }).toDate === "function"
                    ? formatDateTime((row.createdAt as { toDate: () => Date }).toDate())
                    : "—";
                return (
                  <li key={row.id} className="px-3 py-2.5 text-sm">
                    <span className="font-medium text-foreground">{row.materialName}</span>
                    <span className="text-muted"> · {materialCategoryLabel(row.materialCategory)}</span>
                    <span className="tabular-nums text-foreground"> — {row.quantity} од.</span>
                    <p className="mt-0.5 text-xs text-muted">
                      {when}
                      {row.addedByEmail ? ` · ${row.addedByEmail}` : row.addedByUid ? ` · id: ${row.addedByUid.slice(0, 8)}…` : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
