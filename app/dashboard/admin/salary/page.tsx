import Link from "next/link";

export default function AdminSalaryPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
          ← Головна
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Облік зарплати</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Журнал нарахувань, утримань і виплат — окремий модуль. Зараз тут заготовка: пізніше можна підключити таблиці
          нарахувань, експорт у бухгалтерію або інтеграцію з обліковою системою.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center text-sm text-muted">
        Розділ у розробці.
      </div>
    </div>
  );
}
