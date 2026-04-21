"use client";

import { useAuth } from "@/components/auth-provider";
import { canManageOrders } from "@/lib/order-manager-role";
import Link from "next/link";

export default function DashboardHome() {
  const { profile } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Головна</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Замовлення та довідник матеріалів ведуться у Firestore. Авторизація — Firebase. Етапи по кожному
          замовленню проходять по черзі на сторінці «Зміна».
        </p>
        {profile && canManageOrders(profile.role) ? (
          <p className="mt-3 text-sm text-muted">
            Керування:{" "}
            <Link href="/dashboard/admin/orders" className="font-medium text-accent hover:underline">
              замовлення
            </Link>
            ,{" "}
            <Link href="/dashboard/admin/materials" className="font-medium text-accent hover:underline">
              матеріали
            </Link>
            .
          </p>
        ) : null}
      </div>

      <Link
        href="/dashboard/shift"
        className="block max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
      >
        <h2 className="text-lg font-semibold text-foreground">Почати зміну</h2>
        <p className="mt-2 text-sm text-muted">Оберіть замовлення та поточний етап конвеєра.</p>
      </Link>

      <p className="text-sm text-muted">
        <Link href="/dashboard/orders" className="font-medium text-accent underline-offset-2 hover:underline">
          Замовлення
        </Link>
        {" · "}
        <Link href="/dashboard/journal" className="font-medium text-accent underline-offset-2 hover:underline">
          Журнал
        </Link>
        {" · "}
        <Link href="/dashboard/materials" className="font-medium text-accent underline-offset-2 hover:underline">
          Матеріали
        </Link>
      </p>
    </div>
  );
}
