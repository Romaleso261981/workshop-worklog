import { LoginForm } from "./login-form";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await getSession();
  if (session.userId) redirect("/dashboard");

  const users = await prisma.user.findMany({
    select: { email: true },
    orderBy: { email: "asc" },
  });
  const savedEmails = users.map((u) => u.email);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">Вхід</h1>
        <p className="mb-6 text-sm text-muted">Облік змін для цеху (ковані вироби, брами, козирки, забори).</p>
        <LoginForm savedEmails={savedEmails} />
      </div>
    </div>
  );
}
