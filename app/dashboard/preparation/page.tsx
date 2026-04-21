import { startPreparationAction } from "@/app/actions/work";
import { ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import Link from "next/link";
import { PreparationForm } from "./preparation-form";

export default async function PreparationPage() {
  const session = await getSession();
  if (!session.userId) return null;

  const active = await prisma.workEntry.findFirst({
    where: { userId: session.userId, endedAt: null },
  });

  const orders = await prisma.order.findMany({
    where: { status: ORDER_IN_PRODUCTION },
    orderBy: { number: "asc" },
    select: { id: true, number: true, title: true, description: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Підготовка</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Оберіть замовлення зі списку (лише ті, що вже заведені адміністратором і ще в виробництві). Опишіть, що
          робите перед початком робіт по цьому замовленню.
        </p>
      </div>

      {active ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          Завершіть поточну зміну в шапці сторінки, щоб почати новий запис підготовки.
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted">
          Немає замовлень у виробництві. Перегляньте{" "}
          <Link href="/dashboard/orders" className="font-medium text-accent hover:underline">
            каталог замовлень
          </Link>{" "}
          або попросіть адміністратора додати замовлення.
        </div>
      ) : (
        <PreparationForm action={startPreparationAction} orders={orders} />
      )}
    </div>
  );
}
