"use client";

import { startPaintingAction } from "@/app/actions/work";
import type { WorkActionResult } from "@/lib/work-constants";
import type { OrderSelectOption } from "@/lib/order-option";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Row = { color: string; amount: string };

function orderLabel(o: OrderSelectOption) {
  const bits = [o.number];
  if (o.title) bits.push(`— ${o.title}`);
  return bits.join(" ");
}

export function PaintingForm({ orders }: { orders: OrderSelectOption[] }) {
  const router = useRouter();
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([{ color: "", amount: "" }]);
  const [materials, setMaterials] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addRow() {
    setRows((r) => [...r, { color: "", amount: "" }]);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function removeRow(i: number) {
    setRows((r) => (r.length <= 1 ? r : r.filter((_, j) => j !== i)));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orderId) {
      setError("Оберіть замовлення.");
      return;
    }
    startTransition(async () => {
      const res: WorkActionResult = await startPaintingAction({
        orderId,
        colors: rows,
        materials,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOrderId(orders[0]?.id ?? "");
      setMaterials("");
      setRows([{ color: "", amount: "" }]);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div>
        <label htmlFor="orderId" className="mb-1 block text-sm font-medium text-foreground">
          Замовлення
        </label>
        <select
          id="orderId"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          required
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        >
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {orderLabel(o)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Кольори</span>
          <button
            type="button"
            onClick={addRow}
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            + Додати рядок
          </button>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
            <input
              value={row.color}
              onChange={(e) => updateRow(i, { color: e.target.value })}
              placeholder="Колір (RAL, назва)"
              className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none ring-accent focus:ring-2"
            />
            <input
              value={row.amount}
              onChange={(e) => updateRow(i, { amount: e.target.value })}
              placeholder="Кількість / л"
              className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none ring-accent focus:ring-2 sm:max-w-[140px]"
            />
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="rounded-lg border border-border px-2 py-2 text-sm text-muted hover:bg-zinc-50"
                aria-label="Видалити рядок"
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div>
        <label htmlFor="materials" className="mb-1 block text-sm font-medium text-foreground">
          Матеріали для фарбування
        </label>
        <textarea
          id="materials"
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
          rows={4}
          placeholder="Грунт, лак, розчинник, пістолет, дріт тощо"
          className="w-full rounded-lg border border-border px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        />
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
      >
        {pending ? "Збереження…" : "Почати фарбування"}
      </button>
    </form>
  );
}
