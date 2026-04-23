"use client";

import { useAuth } from "@/components/auth-provider";
import { canManageOrders } from "@/lib/order-manager-role";
import Link from "next/link";

export default function DashboardHome() {
  const { profile } = useAuth();
  const processOnly = profile && canManageOrders(profile.role);

  if (processOnly) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Керування процесом</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Замовлення, матеріали, огляд робіт у цеху, робочий час та облік зарплати — з цієї сторінки.
          </p>
        </div>

        <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/dashboard/admin/orders"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-foreground">Замовлення</h2>
            <p className="mt-2 text-sm text-muted">Створення, статуси та закриття замовлень.</p>
          </Link>
          <Link
            href="/dashboard/admin/materials"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-foreground">Матеріали</h2>
            <p className="mt-2 text-sm text-muted">Довідник позицій для цеху.</p>
          </Link>
          <Link
            href="/dashboard/admin/work-journal"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-foreground">Журнал робіт</h2>
            <p className="mt-2 text-sm text-muted">Усі зміни та етапи по замовленнях (усі працівники).</p>
          </Link>
          <Link
            href="/dashboard/admin/work-hours"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-foreground">Журнал робочого часу</h2>
            <p className="mt-2 text-sm text-muted">Підсумки годин за завершеними змінами по кожному.</p>
          </Link>
          <Link
            href="/dashboard/admin/salary"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-foreground">Облік зарплати</h2>
            <p className="mt-2 text-sm text-muted">Денні ставки та нарахування від фактичного часу змін.</p>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Головна</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Замовлення та довідник матеріалів веде адміністратор. Ви фіксуєте етапи на сторінці «Зміна» та переглядаєте
          свій «Журнал».
        </p>
      </div>

      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/shift"
          className="block rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-foreground">Зміна</h2>
          <p className="mt-2 text-sm text-muted">Оберіть замовлення та поточний етап конвеєра.</p>
        </Link>
        <Link
          href="/dashboard/journal"
          className="block rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-foreground">Журнал</h2>
          <p className="mt-2 text-sm text-muted">Ваші завершені та поточні зміни.</p>
        </Link>
      </div>
    </div>
  );
}
