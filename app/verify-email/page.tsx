"use client";

import { useAuth } from "@/components/auth-provider";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { reload, sendEmailVerification } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export default function VerifyEmailPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [hint, setHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.emailVerified) {
      router.replace("/dashboard");
      return;
    }
    if (profile && !profile.requiresEmailVerification) {
      router.replace("/dashboard");
    }
  }, [loading, user, profile, router]);

  function onResend() {
    if (!user) return;
    setHint(null);
    startTransition(async () => {
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        if (origin) {
          await sendEmailVerification(user, { url: `${origin}/verify-email` });
        } else {
          await sendEmailVerification(user);
        }
        setHint("Лист надіслано ще раз. Перевірте «Спам», якщо не бачите вхідних.");
      } catch {
        setHint("Не вдалося надіслати. Зачекайте хвилину й спробуйте знову.");
      }
    });
  }

  function onRecheck() {
    const u = getFirebaseAuth().currentUser;
    if (!u) return;
    setHint(null);
    startTransition(async () => {
      try {
        await reload(u);
        if (getFirebaseAuth().currentUser?.emailVerified) {
          router.replace("/dashboard");
        } else {
          setHint("Пошта ще не підтверджена. Відкрийте посилання з листа, потім натисніть «Я вже підтвердив».");
        }
      } catch {
        setHint("Не вдалося оновити статус. Спробуйте оновити сторінку.");
      }
    });
  }

  if (loading || !user || user.emailVerified) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        Завантаження…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        Завантаження профілю…
      </div>
    );
  }

  if (!profile.requiresEmailVerification) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        Перенаправлення…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">Підтвердження email</h1>
        <p className="mb-4 text-sm text-muted">
          На адресу <span className="font-medium text-foreground">{user.email}</span> надіслано лист із посиланням.
          Перейдіть за посиланням у листі, після чого натисніть кнопку нижче.
        </p>
        {hint ? (
          <p className="mb-4 rounded-lg border border-border bg-accent-soft/40 px-3 py-2 text-sm text-foreground" role="status">
            {hint}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => onRecheck()}
            className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
          >
            Я вже підтвердив — перевірити
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onResend()}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-60"
          >
            Надіслати лист ще раз
          </button>
          <button
            type="button"
            onClick={() => void signOut().then(() => router.replace("/login"))}
            className="text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Вийти й увійти під іншим email
          </button>
          <p className="text-center text-sm text-muted">
            <Link href="/login" className="font-medium text-accent hover:underline">
              На сторінку входу
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
