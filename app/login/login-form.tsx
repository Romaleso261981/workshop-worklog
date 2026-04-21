"use client";

import { loginAction, type ActionResult } from "@/app/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

async function loginFormAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  return loginAction(formData);
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginFormAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
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
        {pending ? "Вхід…" : "Увійти"}
      </button>
      <p className="text-center text-sm text-muted">
        Немає акаунту?{" "}
        <Link href="/register" className="font-medium text-accent underline-offset-2 hover:underline">
          Зареєструватися
        </Link>
      </p>
    </form>
  );
}
