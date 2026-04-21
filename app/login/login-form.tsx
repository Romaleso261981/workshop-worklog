"use client";

import { PasswordInput } from "@/components/password-input";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { COL } from "@/lib/firestore/collections";
import { collection, getDocs } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebaseDb();
        const snap = await getDocs(collection(db, COL.users));
        if (cancelled) return;
        const emails = snap.docs
          .map((d) => (d.data() as { email?: string }).email)
          .filter((e): e is string => !!e)
          .sort((a, b) => a.localeCompare(b));
        setSavedEmails(emails);
      } catch {
        /* rules may block until first user exists */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = email.trim().toLowerCase();
    if (!q) return savedEmails;
    return savedEmails.filter((e) => e.toLowerCase().includes(q));
  }, [email, savedEmails]);

  function clearBlurTimer() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  function openList() {
    clearBlurTimer();
    if (savedEmails.length > 0) setListOpen(true);
  }

  function scheduleClose() {
    clearBlurTimer();
    blurTimer.current = setTimeout(() => setListOpen(false), 180);
  }

  function pickEmail(value: string) {
    setEmail(value);
    setListOpen(false);
    clearBlurTimer();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth();
        await signInWithEmailAndPassword(auth, email.trim(), password);
        router.replace("/dashboard");
      } catch {
        setError("Невірний email або пароль.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} autoComplete="off" className="flex flex-col gap-4">
      <div className="relative">
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-autocomplete="none"
          data-lpignore="true"
          data-1p-ignore="true"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (savedEmails.length > 0) setListOpen(true);
          }}
          onFocus={openList}
          onBlur={scheduleClose}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground outline-none ring-accent focus:ring-2"
        />
        {listOpen && savedEmails.length > 0 ? (
          <ul
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
            role="listbox"
            aria-label="Зареєстровані email"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">Немає збігів.</li>
            ) : (
              filtered.map((e) => (
                <li key={e}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent-soft"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      pickEmail(e);
                    }}
                  >
                    {e}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="password">
          Пароль
        </label>
        <PasswordInput
          id="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
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
        {pending ? "Вхід…" : "Увійти"}
      </button>
      <p className="text-center text-sm text-muted">
        Немає акаунту?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Зареєструватися
        </Link>
      </p>
    </form>
  );
}
