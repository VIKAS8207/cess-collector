"use client";

import { useState } from "react";
import { otpCooldownMs } from "@/lib/domain/settings";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheckIcon } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { FormBanner } from "@/components/auth/form-banner";
import { TextField } from "@/components/auth/text-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { requestReset, resendCode } from "@/lib/api/auth";
import { resetFlowStore } from "@/lib/auth-store";
import { validateEmail } from "@/lib/validation";
import { useCountdown } from "@/hooks/use-countdown";

const linkClass =
  "inline-flex min-h-10 items-center rounded-full text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendFailed, setResendFailed] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const left = useCountdown(cooldownEnd);

  const remember = () => {
    const resendAt = Date.now() + otpCooldownMs();
    setCooldownEnd(resendAt);
    resetFlowStore.set(JSON.stringify({ email: email.trim(), resendAt }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = validateEmail(email);
    setError(found);
    setFailed(false);
    if (found) {
      document.getElementById("email")?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await requestReset(email.trim());
      remember();
      setSent(true);
    } catch {
      setFailed(true);
    }
    setSubmitting(false);
  };

  const onResend = async () => {
    if (resending || left > 0) return;
    setResending(true);
    setResendFailed(false);
    try {
      await resendCode(email.trim());
      remember();
    } catch {
      setResendFailed(true);
    }
    setResending(false);
  };

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        description="If an account with this email exists, we sent a verification code."
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-field bg-muted px-3 py-3 text-sm">
            <MailCheckIcon aria-hidden="true" className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 break-all">{email.trim()}</span>
          </div>
          <FormBanner
            message={resendFailed ? "We couldn't send a new code. Try again." : null}
          />
          <Button size="lg" className="w-full" onClick={() => router.push("/verify")}>
            Enter code
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onResend}
            disabled={left > 0 || resending}
            aria-busy={resending}
          >
            {resending && <Spinner />}
            {left > 0 ? `Resend code in ${left}s` : resending ? "Sending" : "Resend code"}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <button type="button" className={linkClass} onClick={() => setSent(false)}>
              Change email
            </button>
            <Link href="/login" className={linkClass}>
              Back to login
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot password"
      description="Enter your email. We will send you a verification code."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormBanner
          message={failed ? "We couldn't send the code. Try again." : null}
          action={
            failed ? (
              <Button type="submit" variant="outline" disabled={submitting}>
                Try again
              </Button>
            ) : undefined
          }
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (error) setError(validateEmail(v));
          }}
          onBlur={() => setError(validateEmail(email))}
          error={error}
          disabled={submitting}
        />
        <SubmitButton loading={submitting} loadingLabel="Sending code">
          Send code
        </SubmitButton>
        <Link href="/login" className={`${linkClass} justify-center`}>
          Back to login
        </Link>
      </form>
    </AuthCard>
  );
}
