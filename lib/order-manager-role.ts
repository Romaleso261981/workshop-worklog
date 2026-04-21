export type AppRole = "EMPLOYEE" | "ADMIN" | "OWNER";

export function canManageOrders(role: AppRole | string | undefined | null): boolean {
  return role === "ADMIN" || role === "OWNER";
}
