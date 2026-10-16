import { BrandMark } from "@/components/brand";
import { RoleSelect } from "@/components/auth/role-select";
import { LoginArt } from "@/components/auth/login-art";

export function SplitShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid h-dvh overflow-hidden bg-background lg:grid-cols-2">
      <div className="absolute top-5 right-6 z-10 lg:top-8 lg:right-8">
        <RoleSelect />
      </div>
      <main className="relative flex items-center justify-center overflow-y-auto px-6 sm:px-12">
        <BrandMark className="absolute top-6 left-6 size-10 sm:left-12 lg:top-8" />
        <div className="w-full max-w-[400px] py-14">{children}</div>
      </main>
      <div className="relative hidden overflow-hidden lg:block">
        <LoginArt />
      </div>
    </div>
  );
}
