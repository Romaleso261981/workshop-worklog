import { formatDateTime } from "@/lib/format";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import Link from "next/link";

export default async function OrdersCatalogPage() {
  const active = await prisma.order.findMany({
    where: { status: ORDER_IN_PRODUCTION },
    orderBy: { number: "asc" },
  });
  const done = await prisma.order.findMany({
    where: { status: ORDER_DONE },
    orderBy: { completedAt: "desc" },
    take: 100,
  });

  const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Замовлення</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Тут видно всі замовлення у виробництві та архів завершених. Працівники обирають замовлення лише зі списку
          «У виробництві» на сторінках підготовки та фарбування (без ручного вводу номера).
        </p>
        {adminCount === 0 ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-accent-soft px-3 py-2 text-sm text-foreground">
            Підказка: додайте email адміністратора в змінну середовища{" "}
            <code className="rounded bg-white/80 px-1">WORKSHOP_ADMIN_EMAILS</code>, перезапустіть сервер і
            увійдіть знову — з’явиться розділ «Адмін · замовлення» для створення замовлень.
          </p>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">У виробництві ({active.length})</h2>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Немає замовлень у виробництві. Адміністратор може додати їх у розділі{" "}
            <Link href="/dashboard/admin/orders" className="font-medium text-accent hover:underline">
              Адмін · замовлення
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="font-semibold text-foreground">
                  <span className="tabular-nums">{o.number}</span>
                  {o.title ? <span className="ml-2 text-sm font-normal text-muted">— {o.title}</span> : null}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{o.description}</p>
                {o.details ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                    <span className="font-medium text-foreground">Додатково: </span>
                    {o.details}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Архів ({done.length})</h2>
        {done.length === 0 ? (
          <p className="text-sm text-muted">Ще немає завершених замовлень.</p>
        ) : (
          <ul className="space-y-2">
            {done.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-border bg-card/80 px-4 py-3 text-sm"
              >
                <span className="font-medium text-foreground tabular-nums">{o.number}</span>
                {o.title ? <span className="text-muted"> — {o.title}</span> : null}
                {o.completedAt ? (
                  <span className="ml-2 text-muted">· {formatDateTime(o.completedAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
