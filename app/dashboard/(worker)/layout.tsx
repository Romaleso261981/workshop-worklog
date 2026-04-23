"use client";

import { useAuth } from "@/components/auth-provider";
import { canManageOrders } from "@/lib/order-manager-role";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Картка замовлення та список замовлень — спільні для працівників і керівництва (журнал робіт веде сюди). */
function managerMayUseWorkerOrdersRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/dashboard/orders") return true;
  return pathname.startsWith("/dashboard/orders/");
}

export default function WorkerRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const ordersRouteForManager = managerMayUseWorkerOrdersRoute(pathname);

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (canManageOrders(profile.role) && !ordersRouteForManager) {
      router.replace("/dashboard");
    }
  }, [user, profile, loading, router, ordersRouteForManager]);

  if (loading || !user || !profile) {
    return (
      <div className="py-8 text-center text-sm text-muted">Завантаження…</div>
    );
  }

  if (canManageOrders(profile.role) && !ordersRouteForManager) {
    return (
      <div className="py-8 text-center text-sm text-muted">Перенаправлення…</div>
    );
  }

  return <>{children}</>;
}
