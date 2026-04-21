"use client";

import { getFirebaseDb } from "@/lib/firebase/client";
import { isFirestorePermissionDenied, UK_FIRESTORE_RULES_HINT } from "@/lib/firebase/firestore-errors";
import { COL } from "@/lib/firestore/collections";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format";
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
import { useCallback, useEffect, useState } from "react";

type OrderDoc = {
  id: string;
  number: string;
  title: string | null;
  description: string;
  details: string | null;
  status: string;
  createdAt?: unknown;
};

export default function AdminOrdersPage() {
  const [active, setActive] = useState<OrderDoc[]>([]);
  const [done, setDone] = useState<OrderDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const db = getFirebaseDb();
      const snap = await getDocs(collection(db, COL.orders));
      const all: OrderDoc[] = snap.docs.map((d) => {
      const x = d.data() as {
        number?: string;
        title?: string | null;
        description?: string;
        details?: string | null;
        status?: string;
        createdAt?: unknown;
      };
      return {
        id: d.id,
        number: x.number ?? "",
        title: x.title ?? null,
        description: x.description ?? "",
        details: x.details ?? null,
        status: x.status ?? ORDER_IN_PRODUCTION,
        createdAt: x.createdAt,
      };
    });
    setActive(
      all
        .filter((o) => o.status === ORDER_IN_PRODUCTION)
        .sort((a, b) => a.number.localeCompare(b.number)),
    );
    setDone(
      all
        .filter((o) => o.status === ORDER_DONE)
        .sort((a, b) => b.number.localeCompare(a.number))
        .slice(0, 80),
    );
    } catch (e) {
      setActive([]);
      setDone([]);
      setLoadError(isFirestorePermissionDenied(e) ? UK_FIRESTORE_RULES_HINT : "Не вдалося завантажити замовлення.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function createOrder(fd: FormData) {
    setError(null);
    const number = String(fd.get("number") ?? "").trim();
    const title = String(fd.get("title") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const details = String(fd.get("details") ?? "").trim();
    if (!number || !description) {
      setError("Номер і опис обов’язкові.");
      return;
    }
    void (async () => {
      setPending(true);
      try {
        const db = getFirebaseDb();
        const dup = await getDocs(
          query(collection(db, COL.orders), where("number", "==", number)),
        );
        if (!dup.empty) {
          setError("Такий номер замовлення уже існує.");
          return;
        }
        await addDoc(collection(db, COL.orders), {
          number,
          title: title || null,
          description,
          details: details || null,
          status: ORDER_IN_PRODUCTION,
          createdAt: serverTimestamp(),
        });
        await load();
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
        await load();
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Замовлення (керування)</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Створення та закриття замовлень у Firestore. Після закриття замовлення зникає зі списку для працівників.
        </p>
        {loadError ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createOrder(new FormData(e.currentTarget));
        }}
        className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-foreground">Нове замовлення</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="number">
              Номер *
            </label>
            <input
              id="number"
              name="number"
              required
              className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="title">
              Коротка назва
            </label>
            <input
              id="title"
              name="title"
              className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="description">
            Опис *
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="details">
            Додаткові дані
          </label>
          <textarea
            id="details"
            name="details"
            rows={4}
            className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
          />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
        >
          {pending ? "…" : "Додати в виробництво"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">У виробництві ({active.length})</h2>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Немає активних замовлень.
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((o) => (
              <li key={o.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      <span className="tabular-nums">{o.number}</span>
                      {o.title ? <span className="ml-2 text-sm font-normal text-muted">— {o.title}</span> : null}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{o.description}</p>
                    {o.details ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                        <span className="font-medium text-foreground">Додатково: </span>
                        {o.details}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">
                      Створено:{" "}
                      {o.createdAt &&
                      typeof o.createdAt === "object" &&
                      "toDate" in o.createdAt
                        ? formatDateTime((o.createdAt as { toDate: () => Date }).toDate())
                        : "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => completeOrder(o.id)}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Зняти з виробництва
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Архів ({done.length})</h2>
        {done.length === 0 ? (
          <p className="text-sm text-muted">Поки порожньо.</p>
        ) : (
          <ul className="space-y-2 text-sm text-muted">
            {done.map((o) => (
              <li key={o.id} className="rounded-lg border border-border px-4 py-2">
                <span className="font-medium text-foreground tabular-nums">{o.number}</span>
                {o.title ? ` — ${o.title}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
