"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, CircleCheckIcon, XIcon } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormBanner } from "@/components/auth/form-banner";
import { PasswordField } from "@/components/auth/text-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { setNewPassword } from "@/lib/api/auth";
import { parseFlow, resetFlowStore } from "@/lib/auth-store";
import { useStore } from "@/lib/storage-store";
import { passwordRules } from "@/lib/validation";
import { useCountdown } from "@/hooks/use-countdown";
import { cn } from "cn";

const REDIRECT_MS = 5_000;

export function ResetPasswordForm() {
  const router = useRouter();
  const raw = useStore(resetFlowStore);
  const flow = parseFlow(raw);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirectAt, setRedirectAt] = useState<number | null>(null);
  const left = useCountdown(redirectAt);
  const done = redirectAt !== null;

  useEffect(() => {
    if (done || raw === undefined) return;
    if (!flow) router.replace("/forgot-password");
    else if (!flow.verified) router.replace("/verify");
  }, [raw, flow, done, router]);

  useEffect(() => {
    if (done && left === 0) router.replace("/login");
  }, [done, left, router]);

  if (!done && !flow?.verified) return null;

  const allMet = passwordRules.every((r) => r.test(password));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = {
      password: allMet ? undefined : "Your password must meet all requirements.",
      confirm: confirm === password ? undefined : "Passwords don't match.",
    };
    setErrors(found);
    if (found.password || found.confirm) {
      setMessage("Fix the highlighted fields and try again.");
      document.getElementById(found.password ? "new-password" : "confirm-password")?.focus();
      return;
    }
    setMessage(null);
    setSubmitting(true);
    try {
      await setNewPassword(password, flow?.email);
      resetFlowStore.set(null);
      setRedirectAt(Date.now() + REDIRECT_MS);
    } catch {
      setMessage("Something went wrong. Try again.");
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <AuthCard title="Password updated">
        <div className="flex flex-col items-center gap-5 text-center">
          <CircleCheckIcon aria-hidden="true" className="size-12 text-primary" />
          <p role="status" className="text-body-md text-muted-foreground">
            Your password was changed. Taking you to login in {left}{" "}
            {left === 1 ? "second" : "seconds"}.
          </p>
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            Go to login
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" description="Choose a password you have not used before.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormBanner message={message} />
        <PasswordField
          id="new-password"
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
          }}
          error={errors.password}
          disabled={submitting}
          aria-describedby="password-rules"
        />
        <ul id="password-rules" aria-label="Password requirements" className="flex flex-col gap-1.5">
          {passwordRules.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.id} className="flex items-center gap-2 text-sm">
                {met ? (
                  <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                ) : (
                  <XIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                )}
                <span className={met ? "text-foreground" : "text-muted-foreground"}>
                  {rule.label}
                </span>
                <span className="sr-only">{met ? "Met" : "Not met"}</span>
              </li>
            );
          })}
        </ul>
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
          }}
          error={errors.confirm}
          disabled={submitting}
        />
        <SubmitButton loading={submitting} loadingLabel="Updating password">
          Update password
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
