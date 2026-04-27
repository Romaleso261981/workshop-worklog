"use client";

import { MaterialMoneyInput } from "@/components/material-money-input";
import { OrderNpDeliveryFields } from "@/components/order-np-delivery-fields";
import { OrderPhotosEditor, type OrderPhotosEditorHandle } from "@/components/order-photos-editor";
import type { AdminOrderDoc } from "@/lib/admin-order-doc";
import { ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format";
import { forwardRef } from "react";

type Props = {
  mode: "add" | "edit";
  draft: AdminOrderDoc | null;
  formInstanceId: number;
  error: string | null;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  onCompleteProduction?: () => void;
};

export const AdminOrderForm = forwardRef<OrderPhotosEditorHandle, Props>(function AdminOrderForm(
  { mode, draft, formInstanceId, error, pending, onSubmit, onCancel, onCompleteProduction },
  ref,
) {
  const moneyPrefill = {
    amount: draft?.totalCost ?? null,
    currency: draft?.totalCurrency ?? null,
  };

  return (
    <form
      key={formInstanceId}
      onSubmit={(ev) => {
        ev.preventDefault();
        onSubmit(new FormData(ev.currentTarget));
      }}
      className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-foreground">
        {mode === "edit" ? "Редагування замовлення" : "Нове замовлення"}
      </h2>

      {mode === "edit" && draft?.createdAt ? (
        <p className="rounded-lg border border-border bg-accent-soft/40 px-3 py-2 text-sm text-muted">
          Дата створення в системі:{" "}
          {typeof draft.createdAt === "object" &&
          draft.createdAt &&
          "toDate" in draft.createdAt &&
          typeof (draft.createdAt as { toDate: () => Date }).toDate === "function"
            ? formatDateTime((draft.createdAt as { toDate: () => Date }).toDate())
            : "—"}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="number">
            Номер *
          </label>
          <input
            id="number"
            name="number"
            required
            defaultValue={draft?.number ?? ""}
            className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="title">
            Код виробу
          </label>
          <input
            id="title"
            name="title"
            defaultValue={draft?.title ?? ""}
            className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
            placeholder="Напр. A-01229"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="orderFor">
            Для кого (замовник)
          </label>
          <input
            id="orderFor"
            name="orderFor"
            defaultValue={draft?.orderFor ?? ""}
            className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
            placeholder="Назва клієнта / організації"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="clientPhonePrimary">
            Телефон клієнта
          </label>
          <input
            id="clientPhonePrimary"
            name="clientPhonePrimary"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={draft?.clientPhonePrimary ?? ""}
            className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
            placeholder="Номер телефону"
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
          defaultValue={draft?.description ?? ""}
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
          rows={3}
          defaultValue={draft?.details ?? ""}
          className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
        />
      </div>

      <MaterialMoneyInput
        idPrefix="order-total"
        resetKey={formInstanceId}
        initialAmount={moneyPrefill.amount}
        initialCurrency={moneyPrefill.currency}
        amountFieldName="totalCost"
        currencyFieldName="totalCurrency"
        label="Загальна вартість замовлення"
      />

      <OrderNpDeliveryFields
        resetKey={formInstanceId}
        hideManualApiHint
        initialSettlementRef={draft?.npSettlementRef}
        initialSettlementLabel={draft?.npSettlementLabel}
        initialWarehouseRef={draft?.npWarehouseRef}
        initialWarehouseLabel={draft?.npWarehouseLabel}
      />

      <OrderPhotosEditor
        ref={ref}
        resetKey={formInstanceId}
        initialUrls={draft?.photoUrls}
        disabled={pending}
      />

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="addressNote">
          Додатково до адреси (вулиця, під’їзд, коментар для кур’єра)
        </label>
        <textarea
          id="addressNote"
          name="addressNote"
          rows={2}
          defaultValue={draft?.addressNote ?? ""}
          placeholder="Вулиця, будинок, поверх, коментар…"
          className="w-full rounded-lg border border-border px-3 py-2 outline-none ring-accent focus:ring-2"
        />
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-60"
        >
          {pending ? "…" : mode === "edit" ? "Зберегти зміни" : "Додати в виробництво"}
        </button>
        {mode === "edit" && draft?.id && draft.status === ORDER_IN_PRODUCTION && onCompleteProduction ? (
          <button
            type="button"
            disabled={pending}
            onClick={onCompleteProduction}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-60"
          >
            Зняти з виробництва
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-60"
        >
          Скасувати
        </button>
      </div>
    </form>
  );
});

AdminOrderForm.displayName = "AdminOrderForm";
