"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { MATERIAL_CATEGORIES, materialCategoryLabel } from "@/lib/material-categories";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Mat = { id: string; name: string; category: string; notes?: string | null };

export default function AdminMaterialsPage() {
  const [rows, setRows] = useState<Mat[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const snap = await getDocs(collection(db, COL.materials));
      const list: Mat[] = snap.docs.map((d) => {
        const x = d.data() as { name?: string; category?: string; notes?: string | null };
        return {
          id: d.id,
          name: x.name ?? "",
          category: x.category ?? "other",
          notes: x.notes ?? null,
        };
      });
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

  function addMaterial(fd: FormData) {
    setError(null);
    const name = String(fd.get("name") ?? "").trim();
    const category = String(fd.get("category") ?? "other");
    const notes = String(fd.get("notes") ?? "").trim();
    if (!name) {
      setError("Вкажіть назву матеріалу.");
      return;
    }
    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        await addDoc(collection(db, COL.materials), {
          name,
          category,
          notes: notes || null,
          createdAt: serverTimestamp(),
        });
        await load();
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Довідник матеріалів</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Реєструйте фарби, гвинти, профіль, труби та інше — список бачать усі працівники на сторінці «Матеріали».
          </p>
          {loadError ? (
            <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {loadError}
            </p>
          ) : null}
        </div>
        <Link href="/dashboard/materials" className="text-sm font-medium text-accent hover:underline">
          Перегляд для цеху →
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMaterial(new FormData(e.currentTarget));
        }}
        className="max-w-xl space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-foreground">Додати позицію</h2>
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
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="category">
            Категорія
          </label>
          <select
            id="category"
            name="category"
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
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60"
        >
          Зберегти
        </button>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Усі позиції ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Поки порожньо.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted">{materialCategoryLabel(m.category)}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(m.id)}
                  className="text-sm text-red-700 hover:underline disabled:opacity-50"
                >
                  Видалити
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
