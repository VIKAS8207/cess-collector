import { delay } from "./delay";
import { adminOtpAttempts, checkCredentials, completePasswordReset, markLogin, verifyAdminOtp } from "@/lib/domain/admin-store";
import { roleLabel, type RoleId } from "@/lib/roles";

/**
 * Frontend-only simulation of the auth API. Demo behaviour:
 * - login succeeds with any valid email and password DEMO_PASSWORD
 * - 5 failed logins lock sign-in for 30 s
 * - OTP "123456" is correct, "000000" is expired, anything else is wrong (5 tries)
 * - an email containing "error" simulates a server failure
 */
export const DEMO_PASSWORD = "1234";
const MAX_LOGIN_FAILURES = 5;
const LOCK_SECONDS = 30;
const MAX_OTP_ATTEMPTS = 5;

let failures = 0;
let lockedUntil = 0;
let otpAttempts = MAX_OTP_ATTEMPTS;

export type LoginResult =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "inactive" }
  | { status: "wrong-role"; actual: string }
  | { status: "locked"; retryAfter: number };

export async function login(email: string, password: string, role: RoleId): Promise<LoginResult> {
  await delay();
  if (email.toLowerCase().includes("error")) throw new Error("server");
  const now = Date.now();
  if (lockedUntil > now) {
    return { status: "locked", retryAfter: Math.ceil((lockedUntil - now) / 1000) };
  }
  const known = checkCredentials(email, password, role);
  if (known.status === "inactive") return { status: "inactive" };
  if (known.status === "wrong-role") return { status: "wrong-role", actual: roleLabel(known.actual) };
  if (known.status === "ok") {
    failures = 0;
    markLogin(email);
    return { status: "ok" };
  }
  if (known.status === "unknown" && password === DEMO_PASSWORD) {
    failures = 0;
    return { status: "ok" };
  }
  failures += 1;
  if (failures >= MAX_LOGIN_FAILURES) {
    failures = 0;
    lockedUntil = Date.now() + LOCK_SECONDS * 1000;
    return { status: "locked", retryAfter: LOCK_SECONDS };
  }
  return { status: "invalid" };
}

/** Resolves the same way for every address, so accounts are never revealed. */
export async function requestReset(email: string): Promise<void> {
  await delay();
  if (email.toLowerCase().includes("error")) throw new Error("server");
  otpAttempts = MAX_OTP_ATTEMPTS;
}

export const resendCode = requestReset;

export type VerifyResult =
  | { status: "ok" }
  | { status: "wrong"; attemptsRemaining: number }
  | { status: "expired" };

export async function verifyCode(code: string, email?: string): Promise<VerifyResult> {
  await delay();
  // A code issued by an admin for this account takes priority over the demo codes.
  const issued = email ? verifyAdminOtp(email, code) : null;
  if (issued === "ok") return { status: "ok" };
  if (issued === "expired") return { status: "expired" };
  if (issued === "wrong") return { status: "wrong", attemptsRemaining: adminOtpAttempts(email!) ?? 0 };
  if (code === "000000" || otpAttempts <= 0) return { status: "expired" };
  if (code === "123456") return { status: "ok" };
  otpAttempts -= 1;
  if (otpAttempts <= 0) return { status: "expired" };
  return { status: "wrong", attemptsRemaining: otpAttempts };
}

export async function setNewPassword(password: string, email?: string): Promise<void> {
  await delay();
  if (!password) throw new Error("server");
  if (email) completePasswordReset(email, password);
}
