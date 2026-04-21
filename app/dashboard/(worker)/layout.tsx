"use client";

import { useAuth } from "@/components/auth-provider";
import { canManageOrders } from "@/lib/order-manager-role";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WorkerRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (canManageOrders(profile.role)) {
      router.replace("/dashboard");
    }
  }, [user, profile, loading, router]);

  if (loading || !user || !profile) {
    return (
      <div className="py-8 text-center text-sm text-muted">Завантаження…</div>
    );
  }

  if (canManageOrders(profile.role)) {
    return (
      <div className="py-8 text-center text-sm text-muted">Перенаправлення…</div>
    );
  }

  return <>{children}</>;
}
