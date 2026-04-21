import { logoutAction } from "@/app/actions/auth";
import { finishActiveEntryAction } from "@/app/actions/work";
import { formatDateTime } from "@/lib/format";
import { PHASE_PAINTING, PHASE_PREPARATION } from "@/lib/work-constants";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { UserRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

function phaseLabel(phase: string) {
  if (phase === PHASE_PREPARATION) return "Підготовка";
  if (phase === PHASE_PAINTING) return "Фарбування";
  return phase;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user) redirect("/login");

  const active = await prisma.workEntry.findFirst({
    where: { userId: user.id, endedAt: null },
    include: { order: true },
  });

  const navLink =
    "rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-accent-soft hover:text-foreground";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Workshop Worklog
            </span>
            <span className="font-semibold text-foreground">{user.displayName}</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            <Link href="/dashboard" className={navLink}>
              Головна
            </Link>
            <Link href="/dashboard/preparation" className={navLink}>
              Підготовка
            </Link>
            <Link href="/dashboard/painting" className={navLink}>
              Фарбування
            </Link>
            <Link href="/dashboard/journal" className={navLink}>
              Журнал
            </Link>
            <Link href="/dashboard/orders" className={navLink}>
              Замовлення
            </Link>
            {user.role === UserRole.ADMIN ? (
              <Link
                href="/dashboard/admin/orders"
                className={`${navLink} text-accent`}
              >
                Адмін
              </Link>
            ) : null}
            <form action={logoutAction} className="inline">
              <button
                type="submit"
                className="ml-1 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-zinc-100 hover:text-foreground"
              >
                Вийти
              </button>
            </form>
          </nav>
        </div>
      </header>

      {active ? (
        <div className="border-b border-amber-200 bg-accent-soft">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                Активна зміна: {phaseLabel(active.phase)} · замовлення{" "}
                <span className="tabular-nums">{active.order.number}</span>
              </p>
              <p className="text-muted">
                Почато: {formatDateTime(active.startedAt)}
              </p>
            </div>
            <form action={finishActiveEntryAction}>
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                Завершити зміну
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
