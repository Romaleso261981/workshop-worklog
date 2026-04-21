"use client";

import { createOrderAction } from "@/app/actions/admin-orders";
import type { WorkActionResult } from "@/lib/work-constants";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

async function wrap(
  _prev: WorkActionResult | null,
  formData: FormData,
): Promise<WorkActionResult | null> {
  return createOrderAction(formData);
}

export function CreateOrderForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(wrap, null);

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-foreground">Нове замовлення</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="number">
            Номер замовлення *
          </label>
          <input
            id="number"
            name="number"
            required
            className="w-full rounded-lg border border-border px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
            placeholder="2026-0150"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="title">
            Коротка назва
          </label>
          <input
            id="title"
            name="title"
            className="w-full rounded-lg border border-border px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
            placeholder="Брама, козирок…"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="description">
          Опис замовлення *
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          className="w-full rounded-lg border border-border px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
          placeholder="Що виготовляємо, розміри, клієнт, терміни…"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="details">
          Додаткові дані (необов’язково)
        </label>
        <textarea
          id="details"
          name="details"
          rows={5}
          className="w-full rounded-lg border border-border px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
          placeholder="Специфікація, креслення, примітки, комплектність — усе, що варто тримати поруч з замовленням."
        />
      </div>
      {state && "error" in state ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Збереження…" : "Додати в виробництво"}
      </button>
    </form>
  );
}
