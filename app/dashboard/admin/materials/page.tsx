"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import {
  MATERIAL_CATEGORIES,
  SURFACE_FINISH_OPTIONS,
  isPaintLikeCategory,
  isPipeCategory,
  isProfNostelCategory,
  materialCategoryLabel,
  materialDetailSubtexts,
  materialSearchBlob,
  parseMaterialDoc,
  parsePurchaseDateInput,
  parsePurchasePriceInput,
  type MaterialListItem,
} from "@/lib/material-categories";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

function matchesMaterialSearch(m: MaterialListItem, raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return true;
  const haystack = materialSearchBlob(m);
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

export default function AdminMaterialsPage() {
  const [rows, setRows] = useState<MaterialListItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<string>(MATERIAL_CATEGORIES[0].id);

  useEffect(() => {
    if (addOpen) setFormCategory(MATERIAL_CATEGORIES[0].id);
  }, [addOpen]);

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
  const profNostel = isProfNostelCategory(formCategory);
  const pipeCat = isPipeCategory(formCategory);

  function addMaterial(fd: FormData) {
    setError(null);
    const name = String(fd.get("name") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();
    const category = formCategory;
    if (!name) {
      setError("Вкажіть назву матеріалу.");
      return;
    }
    const manufacturer = String(fd.get("manufacturer") ?? "").trim();
    const productCode = String(fd.get("productCode") ?? "").trim();
    const dimensions = String(fd.get("dimensions") ?? "").trim();
    const wallThickness = String(fd.get("wallThickness") ?? "").trim();
    const sheetHeight = String(fd.get("sheetHeight") ?? "").trim();
    const sheetThickness = String(fd.get("sheetThickness") ?? "").trim();
    const surfaceRaw = String(fd.get("surfaceFinish") ?? "");
    const surfaceFinish =
      surfaceRaw === "glossy" || surfaceRaw === "matte" ? surfaceRaw : null;
    const purchasePrice = parsePurchasePriceInput(String(fd.get("purchasePrice") ?? ""));
    const purchaseDate = parsePurchaseDateInput(String(fd.get("purchaseDate") ?? ""));

    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        const isPaint = isPaintLikeCategory(category);
        const isProf = isProfNostelCategory(category);
        const isPipe = isPipeCategory(category);

        await addDoc(collection(db, COL.materials), {
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
          purchasePrice: isPaint || isProf || isPipe ? (purchasePrice ?? null) : null,
          purchaseDate: isPaint || isProf || isPipe ? (purchaseDate ?? null) : null,
          createdAt: serverTimestamp(),
        });
        await load();
        setAddOpen(false);
      } catch {
        setError("Не вдалося зберегти.");
      } finally {
        setPending(false);
      }
    })();
  }

  function remove(id: string) {
    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        await deleteDoc(doc(db, COL.materials, id));
        await load();
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Довідник матеріалів</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Для <strong>Prof. Nostel</strong> — висота, товщина металу, поверхня (глянець або мат), дата та ціна закупівлі.
          Для <strong>труби</strong> — номер, розміри, товщина стінки, дата та ціна. Для фарб — виробник, дата та ціна.
        </p>
        {loadError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block max-w-md flex-1 text-sm">
          <span className="mb-1 block font-medium text-foreground">Пошук</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ключові слова…"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setAddOpen((v) => !v);
            setError(null);
          }}
          className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
        >
          {addOpen ? "Закрити" : "Додати матеріал"}
        </button>
      </div>

      {addOpen ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMaterial(new FormData(e.currentTarget));
          }}
          className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-foreground">Нова позиція</h2>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="category">
              Категорія
            </label>
            <select
              id="category"
              name="category"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
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
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="purchasePrice-paint">
                  Ціна закупівлі (грн)
                </label>
                <input
                  id="purchasePrice-paint"
                  name="purchasePrice"
                  inputMode="decimal"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="0 або 1250,50"
                />
              </div>
            </div>
          ) : null}

          {profNostel ? (
            <div className="space-y-3 rounded-xl border border-border bg-accent-soft/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Prof. Nostel</p>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="sheetHeight">
                  Висота
                </label>
                <input
                  id="sheetHeight"
                  name="sheetHeight"
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
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  defaultValue=""
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
                <label className="mb-1 block text-sm font-medium" htmlFor="purchaseDate-prof">
                  Дата закупівлі
                </label>
                <input
                  id="purchaseDate-prof"
                  name="purchaseDate"
                  type="date"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="purchasePrice-prof">
                  Ціна закупівлі (грн)
                </label>
                <input
                  id="purchasePrice-prof"
                  name="purchasePrice"
                  inputMode="decimal"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="0 або 320"
                />
              </div>
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
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="purchasePrice-pipe">
                  Ціна закупівлі (грн)
                </label>
                <input
                  id="purchasePrice-pipe"
                  name="purchasePrice"
                  inputMode="decimal"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2"
                  placeholder="0 або 320"
                />
              </div>
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
              Зберегти
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAddOpen(false);
                setError(null);
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-foreground disabled:opacity-60"
            >
              Скасувати
            </button>
          </div>
        </form>
      ) : null}

      <section>
        <h2 className="sr-only">Список матеріалів</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Поки порожньо.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">Нічого не знайдено за цим запитом.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {filtered.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
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
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(m.id)}
                  className="shrink-0 text-sm text-red-700 hover:underline disabled:opacity-50"
                >
                  Видалити
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            Показано {filtered.length} з {rows.length}
          </p>
        ) : null}
      </section>
    </div>
  );
}
