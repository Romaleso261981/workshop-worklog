/** Поля замовлення для форми адміна (список + редагування + нове). */
export type AdminOrderDoc = {
  id: string;
  number: string;
  title: string | null;
  description: string;
  details: string | null;
  status: string;
  createdAt?: unknown;
  completedAt?: unknown;
  orderFor?: string | null;
  orderSubject?: string | null;
  totalCost?: number | null;
  totalCurrency?: string | null;
  npSettlementRef?: string | null;
  npSettlementLabel?: string | null;
  npWarehouseRef?: string | null;
  npWarehouseLabel?: string | null;
  addressNote?: string | null;
};
