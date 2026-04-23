"use client";

import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { roleFromEmail } from "@/lib/role-from-email";
import { COL } from "@/lib/firestore/collections";
import type { AppRole } from "@/lib/order-manager-role";
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type UserProfile = {
  displayName: string;
  email: string;
  role: AppRole;
  /** Нові реєстрації: потрібне підтвердження email перед роботою в кабінеті. */
  requiresEmailVerification?: boolean;
};

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const ref = doc(db, COL.users, u.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() as UserProfile & { requiresEmailVerification?: boolean };
        setProfile({
          displayName: d.displayName ?? u.displayName ?? "",
          email: d.email ?? u.email ?? "",
          role: (d.role as AppRole) ?? "EMPLOYEE",
          requiresEmailVerification: d.requiresEmailVerification === true,
        });
      } else {
        const email = u.email ?? "";
        const role = roleFromEmail(email);
        const displayName = u.displayName ?? email.split("@")[0] ?? "Користувач";
        await setDoc(ref, {
          email,
          displayName,
          role,
          createdAt: serverTimestamp(),
        });
        setProfile({ email, displayName, role, requiresEmailVerification: false });
      }
      setLoading(false);
    });
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, signOut }),
    [user, profile, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
