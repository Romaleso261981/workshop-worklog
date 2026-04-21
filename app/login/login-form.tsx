"use client";

import { loginAction, type ActionResult } from "@/app/actions/auth";
import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";

async function loginFormAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  return loginAction(formData);
}

type Props = {
  savedEmails: string[];
};

export function LoginForm({ savedEmails }: Props) {
  const [state, formAction, pending] = useActionState(loginFormAction, null);
  const [email, setEmail] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <form action={formAction} autoComplete="off" className="flex flex-col gap-4">
      <div className="relative">
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="email">
          Email
        </label>
        {/* Visible field: text + inputMode=email avoids Chrome/Google login & address autofill over our list */}
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
          data-bwignore
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
        <input type="hidden" name="email" value={email} />
        {listOpen && savedEmails.length > 0 ? (
          <ul
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
            role="listbox"
            aria-label="Зареєстровані email"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">Немає збігів — введіть email вручну.</li>
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
        {savedEmails.length > 0 ? (
          <p className="mt-1 text-xs text-muted">
            Натисніть у поле — з’явиться список зареєстрованих адрес; оберіть свою або введіть вручну.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">Після першої реєстрації адреси з’являться тут для швидкого вибору.</p>
        )}
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
