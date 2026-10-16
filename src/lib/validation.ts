const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Enter your email.";
  if (!EMAIL.test(value.trim())) return "Enter a valid email, like name@company.com.";
}

export const passwordRules = [
  { id: "length", label: "At least 12 characters", test: (v: string) => v.length >= 12 },
  { id: "letter", label: "Contains a letter", test: (v: string) => /[A-Za-z]/.test(v) },
  { id: "number", label: "Contains a number", test: (v: string) => /\d/.test(v) },
] as const;

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return email;
  const shown = local.length > 2 ? local[0] + "***" + local[local.length - 1] : local[0] + "***";
  return `${shown}@${domain}`;
}
