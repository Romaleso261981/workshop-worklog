export const COL = {
  users: "users",
  orders: "orders",
  /** Підколекція: orders/{orderId}/issuedMaterials — списання/прив’язка матеріалу до замовлення працівником */
  orderIssuedMaterials: "issuedMaterials",
  workEntries: "workEntries",
  materials: "materials",
  /** Документ id = userId: денна ставка (грн) та норма годин для перерахунку з фактичного часу */
  employeeSalaryRates: "employeeSalaryRates",
} as const;
