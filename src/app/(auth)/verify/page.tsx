import type { Metadata } from "next";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";

export const metadata: Metadata = { title: "Verify code" };

export default function VerifyPage() {
  return <VerifyCodeForm />;
}
