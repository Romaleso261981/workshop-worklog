"use client";

import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { COL } from "@/lib/firestore/collections";
import { roleFromEmail } from "@/lib/role-from-email";
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { PasswordInput } from "@/components/password-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(cred.user, { displayName: displayName.trim() });
        const role = roleFromEmail(email.trim());
        await setDoc(doc(db, COL.users, cred.user.uid), {
          email: email.trim(),
          displayName: displayName.trim(),
          role,
          requiresEmailVerification: true,
          createdAt: serverTimestamp(),
        });
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        try {
          if (origin) {
            await sendEmailVerification(cred.user, { url: `${origin}/verify-email` });
          } else {
            await sendEmailVerification(cred.user);
          }
        } catch {
          /* лист можна надіслати знову зі сторінки /verify-email */
        }
        router.replace("/verify-email");
      } catch {
        setError("Не вдалося зареєструватися (email зайнятий або слабкий пароль).");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="displayName">
          Ім’я та прізвище
        </label>
        <input
          id="displayName"
          required
          minLength={2}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="password">
          Пароль (мінімум 8 символів)
        </label>
        <PasswordInput
          id="password"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showPassword={showPassword}
          onToggleVisibility={() => setShowPassword((v) => !v)}
        />
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
        {pending ? "Створення…" : "Зареєструватися"}
      </button>
      <p className="text-center text-sm text-muted">
        Вже є акаунт?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Увійти
        </Link>
      </p>
    </form>
  );
}
