import { formatDateTime } from "@/lib/format";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CompleteOrderForm } from "./complete-order-form";
import { CreateOrderForm } from "./create-order-form";

export default async function AdminOrdersPage() {
  const active = await prisma.order.findMany({
    where: { status: ORDER_IN_PRODUCTION },
    orderBy: { createdAt: "desc" },
  });
  const done = await prisma.order.findMany({
    where: { status: ORDER_DONE },
    orderBy: { completedAt: "desc" },
    take: 80,
  });

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Замовлення (адмін)</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Створюйте замовлення з номером, описом і додатковими полями. Працівники бачать лише замовлення «у
            виробництві». Після завершення виробництва натисніть «Зняти з виробництва» — замовлення зникне з їхнього
            списку й перейде в архів.
          </p>
        </div>
        <Link href="/dashboard/orders" className="text-sm font-medium text-accent hover:underline">
          Перегляд як у працівників →
        </Link>
      </div>

      <CreateOrderForm />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">У виробництві ({active.length})</h2>
        {active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Немає активних замовлень. Додайте перше зверху.
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      <span className="tabular-nums">{o.number}</span>
                      {o.title ? (
                        <span className="ml-2 text-sm font-normal text-muted">— {o.title}</span>
                      ) : null}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{o.description}</p>
                    {o.details ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                        <span className="font-medium text-foreground">Додатково: </span>
                        {o.details}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">Створено: {formatDateTime(o.createdAt)}</p>
                  </div>
                  <CompleteOrderForm orderId={o.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Архів ({done.length})</h2>
        {done.length === 0 ? (
          <p className="text-sm text-muted">Поки що немає завершених замовлень.</p>
        ) : (
          <ul className="space-y-2">
            {done.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-border bg-card/80 px-4 py-3 text-sm text-muted"
              >
                <span className="font-medium text-foreground tabular-nums">{o.number}</span>
                {o.title ? <span> — {o.title}</span> : null}
                {o.completedAt ? (
                  <span className="ml-2">· закрито {formatDateTime(o.completedAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
