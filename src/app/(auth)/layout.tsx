import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-muted px-4 py-10 sm:py-16">
      <header className="mb-8 flex flex-col items-center gap-2 text-center">
        <Brand />
        <p className="text-body-md text-muted-foreground">
          Collect, track and reconcile in one place.
        </p>
      </header>
      <main className="flex w-full flex-1 flex-col items-center sm:flex-none">
        {children}
      </main>
    </div>
  );
}
