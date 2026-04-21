"use client";

import { completeOrderAction } from "@/app/actions/admin-orders";
import type { WorkActionResult } from "@/lib/work-constants";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

async function wrap(
  _prev: WorkActionResult | null,
  formData: FormData,
): Promise<WorkActionResult | null> {
  return completeOrderAction(formData);
}

export function CompleteOrderForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(wrap, null);

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="orderId" value={orderId} />
      {state && "error" in state ? (
        <p className="max-w-xs text-right text-xs text-red-700">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "…" : "Зняти з виробництва"}
      </button>
    </form>
  );
}
