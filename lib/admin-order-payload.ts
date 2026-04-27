import { coercePurchaseCurrency, parseMoneyAmountInput } from "@/lib/material-categories";

export function orderPayloadFromForm(fd: FormData) {
  const number = String(fd.get("number") ?? "").trim();
  const title = String(fd.get("title") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  const details = String(fd.get("details") ?? "").trim();
  const orderFor = String(fd.get("orderFor") ?? "").trim();
  const clientPhonePrimary = String(fd.get("clientPhonePrimary") ?? "")
    .replace(/[^\d()+\-\s]/g, "")
    .trim();
  const totalCost = parseMoneyAmountInput(String(fd.get("totalCost") ?? ""));
  const totalCurrency = coercePurchaseCurrency(fd.get("totalCurrency"));
  const npSettlementRef = String(fd.get("npSettlementRef") ?? "").trim() || null;
  const npSettlementLabel = String(fd.get("npSettlementLabel") ?? "").trim() || null;
  const npWarehouseRef = String(fd.get("npWarehouseRef") ?? "").trim() || null;
  const npWarehouseLabel = String(fd.get("npWarehouseLabel") ?? "").trim() || null;
  const addressNote = String(fd.get("addressNote") ?? "").trim() || null;

  return {
    number,
    title: title || null,
    description,
    details: details || null,
    orderFor: orderFor || null,
    clientPhonePrimary: clientPhonePrimary || null,
    totalCost: totalCost ?? null,
    totalCurrency: totalCost != null ? totalCurrency : null,
    npSettlementRef,
    npSettlementLabel,
    npWarehouseRef,
    npWarehouseLabel,
    addressNote,
  };
}
