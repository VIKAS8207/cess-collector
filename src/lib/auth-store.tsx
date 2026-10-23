"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createStore, useStore } from "@/lib/storage-store";
import { findUserByEmail } from "@/lib/domain/admin-store";
import { DEFAULT_ROLE, parseRole, roleLabel, type RoleId } from "@/lib/roles";

export type User = {
  email: string;
  name: string;
  role: string;
  roleId: RoleId;
  /** True for a signed-in admin, even while viewing the app as another role. */
  isAdmin?: boolean;
};

const sessionStore = createStore("sas:session", "local");
let signedOutOnPurpose = false;

export const resetFlowStore = createStore("sas:reset-flow", "session");

export type ResetFlow = { email: string; resendAt: number; verified?: boolean };

export function parseFlow(raw: string | null | undefined): ResetFlow | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ResetFlow;
  } catch {
    return null;
  }
}

export function userFromEmail(email: string, roleId: RoleId = DEFAULT_ROLE): User {
  const known = findUserByEmail(email);
  if (known) return { email, name: known.name, role: roleLabel(roleId), roleId };
  const local = email.split("@")[0] ?? "user";
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
  return { email, name: name || "User", role: roleLabel(roleId), roleId };
}

type AuthContextValue = {
  /** undefined = still reading storage, null = signed out */
  user: User | null | undefined;
  signIn: (email: string, remember: boolean, roleId?: RoleId) => void;
  /** Admin only: opens the app as another role. Pass "admin" to go back. */
  viewAs: (roleId: RoleId) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const raw = useStore(sessionStore);

  const user = useMemo<User | null | undefined>(() => {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    try {
      const u = JSON.parse(raw) as User;
      return { ...u, roleId: parseRole(u.roleId), isAdmin: u.isAdmin ?? findUserByEmail(u.email)?.role === "admin" };
    } catch {
      return null;
    }
  }, [raw]);

  const signIn = useCallback((email: string, remember: boolean, roleId?: RoleId) => {
    signedOutOnPurpose = false;
    const known = findUserByEmail(email);
    const isAdmin = roleId === "admin" || known?.role === "admin";
    sessionStore.set(JSON.stringify({ ...userFromEmail(email, roleId), isAdmin }), { memoryOnly: !remember });
  }, []);

  const viewAs = useCallback(
    (roleId: RoleId) => {
      if (!user?.isAdmin) return;
      sessionStore.set(JSON.stringify({ ...user, roleId, role: roleLabel(roleId) }), { memoryOnly: false });
      router.push("/dashboard");
    },
    [user, router]
  );

  const signOut = useCallback(() => {
    signedOutOnPurpose = true;
    sessionStore.set(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(() => ({ user, signIn, viewAs, signOut }), [user, signIn, viewAs, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function wasSignedOutOnPurpose() {
  return signedOutOnPurpose;
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}
