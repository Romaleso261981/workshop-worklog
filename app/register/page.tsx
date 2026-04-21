import { RegisterForm } from "./register-form";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const session = await getSession();
  if (session.userId) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">Реєстрація</h1>
        <p className="mb-6 text-sm text-muted">Кожен працівник створює свій акаунт для запису змін по замовленнях.</p>
        <RegisterForm />
      </div>
    </div>
  );
}
