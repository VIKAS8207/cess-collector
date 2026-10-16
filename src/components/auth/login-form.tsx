"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/auth/form-banner";
import { PasswordField, TextField } from "@/components/auth/text-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { login } from "@/lib/api/auth";
import { safeNext, useAuth } from "@/lib/auth-store";
import { parseRole, roleStore } from "@/lib/roles";
import { useStore } from "@/lib/storage-store";
import { validateEmail } from "@/lib/validation";
import { useCountdown } from "@/hooks/use-countdown";

type Errors = { email?: string; password?: string };

export function LoginForm() {
  const router = useRouter();
  const { user, signIn } = useAuth();
  const role = parseRole(useStore(roleStore));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lockEnd, setLockEnd] = useState<number | null>(null);
  const lockLeft = useCountdown(lockEnd);

  // Once signed in, continue to the page the user originally wanted.
  useEffect(() => {
    if (user) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(safeNext(next));
    }
  }, [user, router]);

  const validate = (): Errors => ({
    email: validateEmail(email),
    password: password ? undefined : "Enter your password.",
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || lockLeft > 0) return;
    const found = validate();
    setErrors(found);
    if (found.email || found.password) {
      setMessage("Fix the highlighted fields and try again.");
      document.getElementById(found.email ? "email" : "password")?.focus();
      return;
    }
    setMessage(null);
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password, role);
      if (result.status === "ok") {
        signIn(email.trim(), remember, role);
        return; // keep the loading state while we navigate away
      }
      if (result.status === "inactive") {
        setMessage("This account is inactive. Ask your admin to activate it.");
      } else if (result.status === "wrong-role") {
        setMessage(`This account is a ${result.actual}. Choose that role at the top right.`);
      } else if (result.status === "locked") {
        setLockEnd(Date.now() + result.retryAfter * 1000);
        setMessage(null);
      } else {
        setMessage("Email or password is incorrect.");
        setPassword("");
        setTimeout(() => document.getElementById("password")?.focus(), 0);
      }
    } catch {
      setMessage("Something went wrong. Try again.");
    }
    setSubmitting(false);
  };

  const banner =
    lockLeft > 0
      ? `Too many attempts. Try again in ${lockLeft} ${lockLeft === 1 ? "second" : "seconds"}.`
      : message;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.64px] text-foreground">
          Welcome back!
        </h1>
        <p className="text-body-md text-muted-foreground">
          Log in to see your collections, payments and reports.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormBanner message={banner ?? notice} tone={banner ? "error" : "info"} />
        <TextField
          id="email"
          label="Email"
          required
          placeholder="Enter your mail address"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (errors.email) setErrors((p) => ({ ...p, email: validateEmail(v) }));
          }}
          onBlur={() => setErrors((p) => ({ ...p, email: validateEmail(email) }))}
          error={errors.email}
          disabled={submitting}
        />
        <PasswordField
          id="password"
          label="Password"
          required
          placeholder="Enter password"
          autoComplete="current-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (errors.password && v) setErrors((p) => ({ ...p, password: undefined }));
          }}
          onBlur={() =>
            setErrors((p) => ({
              ...p,
              password: password ? undefined : "Enter your password.",
            }))
          }
          error={errors.password}
          disabled={submitting}
        />
        <div className="flex items-center justify-between gap-4">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={submitting}
              className="size-4 rounded-xs accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            className="inline-flex min-h-10 items-center rounded-full text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton loading={submitting} disabled={lockLeft > 0} loadingLabel="Logging in">
          Log in
        </SubmitButton>
        <div className="flex items-center gap-4 text-caption text-muted-foreground">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          Or, log in with
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="neutral"
          size="lg"
          className="w-full"
          onClick={() => setNotice("Google sign-in isn't available yet.")}
        >
          <span aria-hidden="true" className="text-base font-semibold">
            G
          </span>
          Continue with Google
        </Button>
        <p className="text-center text-sm text-foreground">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => setNotice("Registration isn't available yet.")}
            className="rounded-full text-primary underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Register here
          </button>
        </p>
      </form>
    </div>
  );
}
