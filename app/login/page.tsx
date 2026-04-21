"use client";

import { LoginForm } from "./login-form";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        Завантаження…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">Вхід</h1>
        <p className="mb-6 text-sm text-muted">
          Облік змін для цеху (Firebase Auth + Firestore).
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
