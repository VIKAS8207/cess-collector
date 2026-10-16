"use client";

import { useEffect, useState } from "react";
import { otpCooldownMs } from "@/lib/domain/settings";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { FormBanner } from "@/components/auth/form-banner";
import { OtpInput, focusOtp } from "@/components/auth/otp-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resendCode, verifyCode } from "@/lib/api/auth";
import { parseFlow, resetFlowStore } from "@/lib/auth-store";
import { useStore } from "@/lib/storage-store";
import { maskEmail } from "@/lib/validation";
import { useCountdown } from "@/hooks/use-countdown";

const nextResendAt = () => Date.now() + otpCooldownMs();
const linkClass =
  "inline-flex min-h-10 items-center rounded-full text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

type Problem =
  | { kind: "wrong"; remaining: number }
  | { kind: "expired" }
  | { kind: "server" }
  | { kind: "resend" };

export function VerifyCodeForm() {
  const router = useRouter();
  const raw = useStore(resetFlowStore);
  const flow = parseFlow(raw);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const left = useCountdown(flow?.resendAt ?? null);

  // Reached without starting a reset: send the user to the start.
  useEffect(() => {
    if (raw === null) router.replace("/forgot-password");
  }, [raw, router]);

  if (!flow) return null;

  const expired = problem?.kind === "expired";

  const message = (() => {
    switch (problem?.kind) {
      case "wrong":
        return `That code is incorrect. ${problem.remaining} ${problem.remaining === 1 ? "attempt" : "attempts"} remaining.`;
      case "expired":
        return "This code has expired. Send a new code to continue.";
      case "server":
        return "Something went wrong. Try again.";
      case "resend":
        return "We couldn't send a new code. Try again.";
      default:
        return null;
    }
  })();

  const resend = async () => {
    if (resending) return;
    setResending(true);
    try {
      await resendCode(flow.email);
      resetFlowStore.set(
        JSON.stringify({ ...flow, resendAt: nextResendAt() })
      );
      setProblem(null);
      setCode("");
      setTimeout(() => focusOtp(0), 0);
    } catch {
      setProblem({ kind: "resend" });
    }
    setResending(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || code.length !== 6 || expired) return;
    setSubmitting(true);
    setProblem(null);
    try {
      const result = await verifyCode(code, flow.email);
      if (result.status === "ok") {
        resetFlowStore.set(JSON.stringify({ ...flow, verified: true }));
        router.push("/reset-password");
        return;
      }
      if (result.status === "wrong") {
        setProblem({ kind: "wrong", remaining: result.attemptsRemaining });
        setTimeout(() => focusOtp(0), 0);
      } else {
        setProblem({ kind: "expired" });
      }
    } catch {
      setProblem({ kind: "server" });
    }
    setSubmitting(false);
  };

  return (
    <AuthCard
      title="Enter your code"
      description={
        <>
          We sent a 6-digit code to{" "}
          <span className="text-foreground">{maskEmail(flow.email)}</span>.
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormBanner
          id="otp-message"
          message={message}
          action={
            expired || problem?.kind === "resend" ? (
              <Button
                type="button"
                variant="outline"
                onClick={resend}
                disabled={resending}
                aria-busy={resending}
              >
                {resending && <Spinner />}
                Send a new code
              </Button>
            ) : undefined
          }
        />
        <div className="flex flex-col gap-2">
          <span id="otp-label" className="text-sm text-foreground">
            Verification code
          </span>
          <OtpInput
            labelId="otp-label"
            value={code}
            onChange={setCode}
            disabled={submitting}
            invalid={problem?.kind === "wrong" || expired}
            describedBy={message ? "otp-message" : undefined}
          />
        </div>
        <SubmitButton
          loading={submitting}
          disabled={code.length !== 6 || expired}
          loadingLabel="Verifying"
        >
          Verify code
        </SubmitButton>
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <button
            type="button"
            className={`${linkClass} disabled:pointer-events-none disabled:text-muted-foreground disabled:no-underline`}
            onClick={resend}
            disabled={left > 0 || resending}
          >
            {left > 0 ? `Resend code in ${left}s` : "Resend code"}
          </button>
          <Link href="/login" className={linkClass}>
            Back to login
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
