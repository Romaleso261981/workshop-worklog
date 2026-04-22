"use client";

import {
  PURCHASE_CURRENCIES,
  type PurchaseCurrencyId,
  coercePurchaseCurrency,
  formatAmountGrouped,
  parseMoneyAmountInput,
} from "@/lib/material-categories";
import { useCallback, useEffect, useState } from "react";

type Props = {
  idPrefix: string;
  /** Скидає / перезавантажує поле (відкриття форми, зміна позиції) */
  resetKey?: string | number;
  initialAmount?: number | null;
  initialCurrency?: string | null;
  /** Імена полів у FormData (за замовчуванням — для матеріалів) */
  amountFieldName?: string;
  currencyFieldName?: string;
  /** Підпис над полем суми */
  label?: string;
};

export function MaterialMoneyInput({
  idPrefix,
  resetKey = 0,
  initialAmount = null,
  initialCurrency = null,
  amountFieldName = "purchasePrice",
  currencyFieldName = "purchaseCurrency",
  label = "Сума закупівлі",
}: Props) {
  const [currency, setCurrency] = useState<PurchaseCurrencyId>("UAH");
  const [amount, setAmount] = useState<number | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    const curr = coercePurchaseCurrency(initialCurrency) as PurchaseCurrencyId;
    setCurrency(curr);
    if (initialAmount != null && Number.isFinite(initialAmount)) {
      setAmount(initialAmount);
      setText(formatAmountGrouped(initialAmount, curr));
    } else {
      setAmount(null);
      setText("");
    }
  }, [resetKey, initialAmount, initialCurrency]);

  const applyFormat = useCallback((raw: string, curr: PurchaseCurrencyId) => {
    const n = parseMoneyAmountInput(raw);
    setAmount(n);
    if (n != null) setText(formatAmountGrouped(n, curr));
    else if (!raw.trim()) setText("");
    else setText(raw.trim());
  }, []);

  return (
    <div className="space-y-1">
      <input
        type="hidden"
        name={amountFieldName}
        value={amount != null && Number.isFinite(amount) ? String(amount) : ""}
      />
      <input type="hidden" name={currencyFieldName} value={currency} />
      <label className="mb-1 block text-sm font-medium" htmlFor={`${idPrefix}-amount`}>
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <select
          id={`${idPrefix}-currency`}
          className="w-full shrink-0 rounded-lg border border-border bg-card px-3 py-2 outline-none ring-accent focus:ring-2 sm:max-w-44"
          value={currency}
          onChange={(e) => {
            const c = e.target.value as PurchaseCurrencyId;
            const n = parseMoneyAmountInput(text);
            setAmount(n);
            setCurrency(c);
            if (n != null) setText(formatAmountGrouped(n, c));
          }}
        >
          {PURCHASE_CURRENCIES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          id={`${idPrefix}-amount`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => applyFormat(text, currency)}
          onFocus={() => {
            if (amount != null) {
              const dec = String(amount);
              setText(dec.includes(".") ? dec.replace(".", ",") : dec);
            }
          }}
          placeholder="Напр. 12 500,50"
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 font-medium tabular-nums outline-none ring-accent focus:ring-2"
        />
      </div>
      <p className="text-xs text-muted">Пробіли між розрядами можна вводити вручну; після виходу з поля сума вирівнюється.</p>
    </div>
  );
}
