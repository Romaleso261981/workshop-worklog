"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseDb } from "@/lib/firebase/client";
import { COL } from "@/lib/firestore/collections";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { materialCategoryLabel } from "@/lib/material-categories";
import { collection, getDocs } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

type Mat = { id: string; name: string; category: string; notes?: string | null };

export default function MaterialsCatalogPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Mat[]>([]);
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
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити матеріали.");
    }
  }, []);

  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user, load]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Матеріали</h1>
        {loadError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted">
          Довідник матеріалів цеху (фарби, кріплення, профіль, труби тощо). Редагування — у розділі керування для
          адміністратора та власника виробництва.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          Поки що порожньо. Адміністратор може додати позиції в «Довідник матеріалів».
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((m) => (
            <li key={m.id} className="px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{m.name}</p>
              <p className="text-xs text-muted">{materialCategoryLabel(m.category)}</p>
              {m.notes ? <p className="mt-1 text-muted">{m.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
