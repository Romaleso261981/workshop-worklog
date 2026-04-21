"use client";

import { useAuth } from "@/components/auth-provider";
import { canManageOrders } from "@/lib/order-manager-role";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!profile || !canManageOrders(profile.role)) {
      router.replace("/dashboard");
    }
  }, [user, profile, loading, router]);

  if (loading || !user || !profile || !canManageOrders(profile.role)) {
    return (
      <div className="py-8 text-center text-sm text-muted">Перевірка доступу…</div>
    );
  }

  return <>{children}</>;
}
