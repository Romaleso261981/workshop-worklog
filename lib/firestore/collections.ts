export const COL = {
  users: "users",
  orders: "orders",
  /** Підколекція: orders/{orderId}/issuedMaterials — списання/прив’язка матеріалу до замовлення працівником */
  orderIssuedMaterials: "issuedMaterials",
  workEntries: "workEntries",
  materials: "materials",
} as const;
