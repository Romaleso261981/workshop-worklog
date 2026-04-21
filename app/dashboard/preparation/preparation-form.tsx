"use client";

import type { WorkActionResult } from "@/lib/work-constants";
import type { OrderSelectOption } from "@/lib/order-option";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

type Props = {
  action: (formData: FormData) => Promise<WorkActionResult>;
  orders: OrderSelectOption[];
};

async function wrap(
  action: Props["action"],
  _prev: WorkActionResult | null,
  formData: FormData,
): Promise<WorkActionResult | null> {
  return action(formData);
}

function orderLabel(o: OrderSelectOption) {
  const bits = [o.number];
  if (o.title) bits.push(`— ${o.title}`);
  return bits.join(" ");
}

export function PreparationForm({ action, orders }: Props) {
  const router = useRouter();
  const bound = wrap.bind(null, action);
  const [state, formAction, pending] = useActionState(bound, null);

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <label htmlFor="orderId" className="mb-1 block text-sm font-medium text-foreground">
          Замовлення
        </label>
        <select
          id="orderId"
          name="orderId"
          required
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
          defaultValue=""
        >
          <option value="" disabled>
            Оберіть замовлення…
          </option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {orderLabel(o)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted">
          Повний опис — у розділі «Замовлення». Тут лише вибір з активного виробництва.
        </p>
      </div>
      <div>
        <label htmlFor="beforeOrderNotes" className="mb-1 block text-sm font-medium text-foreground">
          Що робите перед початком по замовленню
        </label>
        <textarea
          id="beforeOrderNotes"
          name="beforeOrderNotes"
          required
          rows={5}
          placeholder="Наприклад: прибирання зони, зачистка швів, перевірка комплекту…"
          className="w-full rounded-lg border border-border px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
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
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
      >
        {pending ? "Збереження…" : "Почати підготовку"}
      </button>
    </form>
  );
}
