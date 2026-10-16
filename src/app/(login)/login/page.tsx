import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return <LoginScreen />;
}
