"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { MaterialMoneyInput } from "@/components/material-money-input";
import {
  MATERIAL_CATEGORIES,
  SURFACE_FINISH_OPTIONS,
  coercePurchaseCurrency,
  isPaintLikeCategory,
  isPipeCategory,
  isProfnastylCategory,
  materialCategoryLabel,
  materialDetailSubtexts,
  materialSearchBlob,
  parseMaterialDoc,
  parseMoneyAmountInput,
  parsePurchaseDateInput,
  type MaterialListItem,
} from "@/lib/material-categories";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

function matchesMaterialSearch(m: MaterialListItem, raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return true;
  const haystack = materialSearchBlob(m);
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

function materialPayloadFromForm(fd: FormData, category: string) {
  const name = String(fd.get("name") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim();
  const manufacturer = String(fd.get("manufacturer") ?? "").trim();
  const productCode = String(fd.get("productCode") ?? "").trim();
  const dimensions = String(fd.get("dimensions") ?? "").trim();
  const wallThickness = String(fd.get("wallThickness") ?? "").trim();
  const sheetHeight = String(fd.get("sheetHeight") ?? "").trim();
  const sheetThickness = String(fd.get("sheetThickness") ?? "").trim();
  const surfaceRaw = String(fd.get("surfaceFinish") ?? "");
  const surfaceFinish =
    surfaceRaw === "glossy" || surfaceRaw === "matte" ? surfaceRaw : null;
  const sheetColor = String(fd.get("sheetColor") ?? "").trim();
  const purchasePrice = parseMoneyAmountInput(String(fd.get("purchasePrice") ?? ""));
  const purchaseCurrency = coercePurchaseCurrency(fd.get("purchaseCurrency"));
  const purchaseDate = parsePurchaseDateInput(String(fd.get("purchaseDate") ?? ""));

  const isPaint = isPaintLikeCategory(category);
  const isProf = isProfnastylCategory(category);
  const isPipe = isPipeCategory(category);

  return {
    name,
    category,
    notes: notes || null,
    manufacturer: isPaint ? (manufacturer || null) : null,
    productCode: isPipe ? (productCode || null) : null,
    dimensions: isPipe ? (dimensions || null) : null,
    wallThickness: isPipe ? (wallThickness || null) : null,
    sheetHeight: isProf ? (sheetHeight || null) : null,
    sheetThickness: isProf ? (sheetThickness || null) : null,
    surfaceFinish: isProf ? surfaceFinish : null,
    sheetColor: isProf ? (sheetColor || null) : null,
    purchasePrice: isPaint || isProf || isPipe ? (purchasePrice ?? null) : null,
    purchaseCurrency:
      (isPaint || isProf || isPipe) && purchasePrice != null ? purchaseCurrency : null,
    purchaseDate: isPaint || isProf || isPipe ? (purchaseDate ?? null) : null,
  };
}

export default function AdminMaterialsPage() {
  const [rows, setRows] = useState<MaterialListItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formInstanceId, setFormInstanceId] = useState(0);
  const [formCategory, setFormCategory] = useState<string>(MATERIAL_CATEGORIES[0].id);

  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [rows, editingId],
  );

  useEffect(() => {
    if (formOpen && formMode === "add") {
      setFormCategory(MATERIAL_CATEGORIES[0].id);
    }
  }, [formOpen, formMode]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const snap = await getDocs(collection(db, COL.materials));
      const list: MaterialListItem[] = snap.docs.map((d) =>
        parseMaterialDoc(d.id, d.data() as Record<string, unknown>),
      );
      list.sort((a, b) => a.name.localeCompare(b.name, "uk"));
      setRows(list);
    } catch (e) {
      setRows([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити список.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((m) => matchesMaterialSearch(m, search)),
    [rows, search],
  );

  const paintLike = isPaintLikeCategory(formCategory);
  const profnastyl = isProfnastylCategory(formCategory);
  const pipeCat = isPipeCategory(formCategory);

  const moneyPrefill =
    formMode === "edit" && editingRow && formCategory === editingRow.category
      ? {
          amount: editingRow.purchasePrice ?? null,
          currency: editingRow.purchaseCurrency ?? null,
        }
      : { amount: null as number | null, currency: null as string | null };

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setError(null);
  }

  function openAdd() {
    setFormMode("add");
    setEditingId(null);
    setFormInstanceId((i) => i + 1);
    setFormOpen(true);
    setError(null);
  }

  function openEdit(m: MaterialListItem) {
    setFormMode("edit");
    setEditingId(m.id);
    setFormCategory(m.category);
    setFormInstanceId((i) => i + 1);
    setFormOpen(true);
    setError(null);
  }

  function saveMaterial(fd: FormData) {
    setError(null);
    const payload = materialPayloadFromForm(fd, formCategory);
    if (!payload.name) {
      setError("Вкажіть назву матеріалу.");
      return;
    }

    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        if (formMode === "edit" && editingId) {
          await updateDoc(doc(db, COL.materials, editingId), {
            ...payload,
            updatedAt: serverTimestamp(),
          });
        } else {
          await addDoc(collection(db, COL.materials), {
            ...payload,
            createdAt: serverTimestamp(),
          });
        }
        await load();
        closeForm();
      } catch {
        setError("Не вдалося зберегти.");
      } finally {
        setPending(false);
      }
    })();
  }

  function remove(id: string, ev: MouseEvent) {
    ev.stopPropagation();
    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        await deleteDoc(doc(db, COL.materials, id));
        if (editingId === id) closeForm();
        await load();
      } finally {
        setPending(false);
      }
    })();
  }

  const draft = editingRow;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Довідник матеріалів</h1>
        {loadError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1 sm:max-w-md">
          <span className="sr-only">Пошук</span>
          <input
            type="search"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder="Пошук…"
            aria-label="Пошук по довіднику"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (formOpen) closeForm();
            else openAdd();
          }}
          className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
        >
          {formOpen ? "Закрити" : "Додати матеріал"}
        </button>
      </div>

      {formOpen ? (
        <form
          key={formInstanceId}
          onSubmit={(ev) => {
            ev.preventDefault();
            saveMaterial(new FormData(ev.currentTarget));
          }}
          className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-foreground">
            {formMode === "edit" ? "Редагування позиції" : "Нова позиція"}
          </h2>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="category">
              Категорія
            </label>
            <select
              id="category"
              name="category"
              value={formCategory}
              onChange={(ev) => setFormCategory(ev.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
            >
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="name">
              Назва *
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={draft?.name ?? ""}
              className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
              placeholder="Напр. RAL 8017 мат"
            />
          </div>

          {paintLike ? (
            <div className="space-y-3 rounded-xl border border-border bg-accent-soft/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Фарба / ґрунт / розчинник</p>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="manufacturer">
                  Виробник
                </label>
                <input
                  id="manufacturer"
                  name="manufacturer"
                  defaultValue={draft?.manufacturer ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="Напр. Tikkurila, Dufa"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="purchaseDate-paint">
                  Дата закупівлі
                </label>
                <input
                  id="purchaseDate-paint"
                  name="purchaseDate"
                  type="date"
                  defaultValue={draft?.purchaseDate ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                />
              </div>
              <MaterialMoneyInput
                idPrefix="paint"
                resetKey={formInstanceId}
                initialAmount={paintLike ? moneyPrefill.amount : null}
                initialCurrency={paintLike ? moneyPrefill.currency : null}
              />
            </div>
          ) : null}

          {profnastyl ? (
            <div className="space-y-3 rounded-xl border border-border bg-accent-soft/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Профнастил</p>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="sheetHeight">
                  Висота
                </label>
                <input
                  id="sheetHeight"
                  name="sheetHeight"
                  defaultValue={draft?.sheetHeight ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="Напр. висота хвилі 44 мм"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="sheetThickness">
                  Товщина
                </label>
                <input
                  id="sheetThickness"
                  name="sheetThickness"
                  defaultValue={draft?.sheetThickness ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="Напр. 0,5 мм"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="surfaceFinish">
                  Поверхня
                </label>
                <select
                  id="surfaceFinish"
                  name="surfaceFinish"
                  defaultValue={draft?.surfaceFinish ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                >
                  <option value="">— оберіть —</option>
                  {SURFACE_FINISH_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="sheetColor">
                  Колір
                </label>
                <input
                  id="sheetColor"
                  name="sheetColor"
                  defaultValue={draft?.sheetColor ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="Напр. RAL 3005, червоний оксид"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="purchaseDate-prof">
                  Дата закупівлі
                </label>
                <input
                  id="purchaseDate-prof"
                  name="purchaseDate"
                  type="date"
                  defaultValue={draft?.purchaseDate ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                />
              </div>
              <MaterialMoneyInput
                idPrefix="prof"
                resetKey={formInstanceId}
                initialAmount={profnastyl ? moneyPrefill.amount : null}
                initialCurrency={profnastyl ? moneyPrefill.currency : null}
              />
            </div>
          ) : null}

          {pipeCat ? (
            <div className="space-y-3 rounded-xl border border-border bg-accent-soft/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Труба</p>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="productCode">
                  Номер / артикул
                </label>
                <input
                  id="productCode"
                  name="productCode"
                  defaultValue={draft?.productCode ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="Внутрішній номер позиції"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="dimensions">
                  Розміри
                </label>
                <input
                  id="dimensions"
                  name="dimensions"
                  defaultValue={draft?.dimensions ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="Напр. 20×30 мм"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="wallThickness">
                  Товщина стінки
                </label>
                <input
                  id="wallThickness"
                  name="wallThickness"
                  defaultValue={draft?.wallThickness ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="Напр. 1,5 мм"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="purchaseDate-pipe">
                  Дата закупівлі
                </label>
                <input
                  id="purchaseDate-pipe"
                  name="purchaseDate"
                  type="date"
                  defaultValue={draft?.purchaseDate ?? ""}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                />
              </div>
              <MaterialMoneyInput
                idPrefix="pipe"
                resetKey={formInstanceId}
                initialAmount={pipeCat ? moneyPrefill.amount : null}
                initialCurrency={pipeCat ? moneyPrefill.currency : null}
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="notes">
              Примітки
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={draft?.notes ?? ""}
              className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {formMode === "edit" ? "Зберегти зміни" : "Зберегти"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={closeForm}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-foreground disabled:opacity-60"
            >
              Скасувати
            </button>
          </div>
        </form>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Список матеріалів</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Поки порожньо.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">Нічого не знайдено за цим запитом.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {filtered.map((m) => (
              <li
                key={m.id}
                className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm ${
                  formOpen && formMode === "edit" && editingId === m.id ? "bg-accent-soft/40 ring-1 ring-inset ring-accent/30" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted">{materialCategoryLabel(m.category)}</p>
                  {materialDetailSubtexts(m).map((line, i) => (
                    <p key={i} className="mt-1 text-xs text-muted">
                      {line}
                    </p>
                  ))}
                  {m.notes ? <p className="mt-1 text-xs text-muted">{m.notes}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => openEdit(m)}
                    className="text-sm font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Редагувати
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={(ev) => remove(m.id, ev)}
                    className="text-sm text-red-700 hover:underline disabled:opacity-50"
                  >
                    Видалити
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
