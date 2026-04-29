"use client";

import { startStageFirestore } from "@/lib/firestore/shift-ops";
import { PIPELINE_STAGES } from "@/lib/pipeline";
import type { WorkActionResult } from "@/lib/work-constants";
import type { OrderSelectOption } from "@/lib/order-option";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type Row = { color: string; amount: string };

export type OrderShiftMeta = OrderSelectOption & {
  nextStageId: string | null;
  nextLabel: string | null;
  allDone: boolean;
  blocked: boolean;
  activePhaseLabel: string | null;
};

function orderLine(o: OrderShiftMeta) {
  const bits = [o.number];
  if (o.title) bits.push(`— ${o.title}`);
  return bits.join(" ");
}

export function ShiftWorkForm({
  orders,
  onDone,
}: {
  orders: OrderShiftMeta[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([{ color: "", amount: "" }]);
  const [materials, setMaterials] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredOrders = useMemo(() => {
    if (stageFilter === "ALL") return orders;
    return orders.filter((o) => o.nextStageId === stageFilter);
  }, [orders, stageFilter]);

  const countByStage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const id = o.nextStageId ?? "";
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  const selected = useMemo(
    () => filteredOrders.find((o) => o.id === orderId) ?? null,
    [filteredOrders, orderId],
  );

  const isPaint = selected?.nextStageId === "PAINT";

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
    if (!selected?.nextStageId) {
      setError("Оберіть замовлення з доступним етапом.");
      return;
    }
    startTransition(async () => {
      const res: WorkActionResult = await startStageFirestore({
        orderId,
        stageId: selected.nextStageId!,
        notes,
        colors: rows,
        materials,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setNotes("");
      setMaterials("");
      setRows([{ color: "", amount: "" }]);
      onDone?.();
      router.refresh();
    });
  }

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setOrderId("");
      return;
    }
    if (!filteredOrders.some((o) => o.id === orderId)) {
      setOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, orderId]);

  if (orders.length === 0) {
    return null;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div>
        <label htmlFor="stageFilter" className="mb-1 block text-sm font-medium text-foreground">
          Фільтр за етапом
        </label>
        <select
          id="stageFilter"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        >
          <option value="ALL">Усі етапи ({orders.length})</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} ({countByStage[s.id] ?? 0})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="orderId" className="mb-1 block text-sm font-medium text-foreground">
          Замовлення
        </label>
        <p className="mb-2 text-xs text-muted">
          Кількість виробів: <span className="font-medium tabular-nums text-foreground">{filteredOrders.length}</span>
          {selected?.nextLabel ? (
            <>
              {" "}
              · Етап: <span className="font-medium text-foreground">{selected.nextLabel}</span>
            </>
          ) : null}
        </p>
        <select
          id="orderId"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          required
          disabled={filteredOrders.length === 0}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        >
          {filteredOrders.map((o) => (
            <option key={o.id} value={o.id}>
              {orderLine(o)}
            </option>
          ))}
        </select>
        {filteredOrders.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Немає замовлень для вибраного етапу.</p>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Внизу списку: <span className="font-medium tabular-nums text-foreground">{filteredOrders.length}</span>
          {selected ? (
            <>
              {" "}
              · Номер замовлення: <span className="font-medium tabular-nums text-foreground">{selected.number}</span>
              {selected.nextLabel ? (
                <>
                  {" "}
                  · Етап: <span className="font-medium text-foreground">{selected.nextLabel}</span>
                </>
              ) : null}
            </>
          ) : null}
        </p>
        {orderId ? (
          <p className="mt-2 text-sm">
            <Link
              href={`/dashboard/orders/${orderId}`}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Деталі замовлення та облік матеріалів →
            </Link>
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className="rounded-lg border border-border bg-accent-soft/40 px-3 py-2 text-sm">
          {selected.allDone && !selected.blocked ? (
            <p className="text-foreground">
              Усі етапи пройдені, замовлення в архіві. Якщо щойно завершили «Відправлення», оновіть сторінку — запис
              зникне зі списку зміни.
            </p>
          ) : selected.nextLabel ? (
            <p className="text-foreground">
              Наступний етап (доступний зараз): <strong>{selected.nextLabel}</strong>
            </p>
          ) : (
            <p className="text-muted">Немає доступного етапу.</p>
          )}
        </div>
      ) : null}

      {isPaint ? (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Кольори</span>
              <button
                type="button"
                onClick={addRow}
                className="text-sm font-medium text-accent underline-offset-2 hover:underline"
              >
                + Рядок
              </button>
            </div>
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                <input
                  value={row.color}
                  onChange={(e) => updateRow(i, { color: e.target.value })}
                  placeholder="Колір (RAL, назва)"
                  className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                />
                <input
                  value={row.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                  placeholder="Кількість / л"
                  className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none ring-accent focus:ring-2 sm:max-w-[140px]"
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
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="materials">
              Матеріали
            </label>
            <textarea
              id="materials"
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              placeholder="Грунт, лак, розчинник…"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="notes">
              Примітки (необов’язково)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-foreground">
            Що робите на цьому етапі *
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required={!isPaint}
            rows={5}
            className="w-full rounded-lg border border-border px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
            placeholder="Коротко зафіксуйте дії на етапі…"
          />
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          pending || !selected?.nextStageId || selected.allDone || (!isPaint && !notes.trim())
        }
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Збереження…" : "Почати етап"}
      </button>
    </form>
  );
}
