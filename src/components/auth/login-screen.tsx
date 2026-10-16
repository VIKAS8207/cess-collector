"use client";

import { LoginForm } from "@/components/auth/login-form";
import { SplitShell } from "@/components/auth/split-shell";
import { useAuth } from "@/lib/auth-store";

/**
 * The login page stays mounted while the user is inside the app. Re-keying it on
 * sign-in state gives a fresh, enabled form after every sign-out.
 */
export function LoginScreen() {
  const { user } = useAuth();
  return (
    <SplitShell>
      <LoginForm key={user ? "signed-in" : "signed-out"} />
    </SplitShell>
  );
}
