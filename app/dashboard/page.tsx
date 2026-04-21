import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { UserRole } from "@prisma/client";
import Link from "next/link";

export default async function DashboardHome() {
  const session = await getSession();
  if (!session.userId) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const active = await prisma.workEntry.findFirst({
    where: { userId: session.userId, endedAt: null },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Головна</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Замовлення заводить адміністратор; у підготовці та фарбуванні ви обираєте лише зі списку замовлень у
          виробництві. Один активний запис на працівника — завершіть зміну в шапці, перш ніж починати нову.
        </p>
        {user?.role === UserRole.ADMIN ? (
          <p className="mt-3 text-sm text-muted">
            Як адміністратор, ви можете керувати замовленнями в розділі{" "}
            <Link href="/dashboard/admin/orders" className="font-medium text-accent hover:underline">
              Адмін
            </Link>
            .
          </p>
        ) : null}
      </div>

      {active ? (
        <p className="rounded-xl border border-amber-200 bg-accent-soft px-4 py-3 text-sm text-foreground">
          У вас є незавершена зміна. Натисніть «Завершити зміну» у жовтій смузі зверху, коли роботу закінчено.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard/preparation"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-foreground">Підготовка</h2>
            <p className="mt-2 text-sm text-muted">
              Вибір замовлення зі списку та опис робіт перед початком по замовленню.
            </p>
          </Link>
          <Link
            href="/dashboard/painting"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow"
          >
            <h2 className="text-lg font-semibold text-foreground">Фарбування</h2>
            <p className="mt-2 text-sm text-muted">
              Вибір замовлення, кольори, матеріали; час початку й завершення фіксується автоматично.
            </p>
          </Link>
        </div>
      )}

      <p className="text-sm text-muted">
        Каталог замовлень:{" "}
        <Link href="/dashboard/orders" className="font-medium text-accent underline-offset-2 hover:underline">
          Замовлення
        </Link>
        . Усі зміни:{" "}
        <Link href="/dashboard/journal" className="font-medium text-accent underline-offset-2 hover:underline">
          Журнал
        </Link>
        .
      </p>
    </div>
  );
}
