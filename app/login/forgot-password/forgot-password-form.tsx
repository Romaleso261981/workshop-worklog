"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";
import { sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { useState, useTransition } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Введіть email.");
      return;
    }
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth();
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        if (origin) {
          await sendPasswordResetEmail(auth, trimmed, { url: `${origin}/login` });
        } else {
          await sendPasswordResetEmail(auth, trimmed);
        }
        setSent(true);
      } catch (err: unknown) {
        const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
        if (code === "auth/invalid-email") {
          setError("Некоректний формат email.");
        } else if (code === "auth/missing-email") {
          setError("Введіть email.");
        } else {
          setError("Не вдалося надіслати лист. Перевірте email або спробуйте пізніше.");
        }
      }
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-border bg-accent-soft/40 px-4 py-3 text-sm text-foreground">
          Якщо обліковий запис з таким email існує, на пошту надіслано лист із посиланням для встановлення нового
          пароля. Перевірте вхідні та папку «Спам». Після зміни пароля можете{" "}
          <Link href="/login" className="font-medium text-accent underline-offset-2 hover:underline">
            увійти
          </Link>
          .
        </p>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          ← Назад до входу
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="email">
          Email облікового запису
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
          placeholder="you@example.com"
        />
        <p className="mt-2 text-xs text-muted">
          На цю адресу Firebase надішле стандартний лист із посиланням (шаблон листа налаштовується в Firebase Console →
          Authentication → Templates).
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
      >
        {pending ? "Надсилання…" : "Надіслати лист для відновлення"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          ← Повернутися до входу
        </Link>
      </p>
    </form>
  );
}
