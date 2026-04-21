"use client";

import { registerAction, type ActionResult } from "@/app/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

async function registerFormAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  return registerAction(formData);
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerFormAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="displayName">
          Ім’я та прізвище
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="password">
          Пароль (мінімум 8 символів)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        />
      </div>
      {state && "error" in state ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
      >
        {pending ? "Створення…" : "Зареєструватися"}
      </button>
      <p className="text-center text-sm text-muted">
        Вже є акаунт?{" "}
        <Link href="/login" className="font-medium text-accent underline-offset-2 hover:underline">
          Увійти
        </Link>
      </p>
    </form>
  );
}
