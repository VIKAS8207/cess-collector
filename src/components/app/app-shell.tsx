"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { ToastProvider } from "@/components/gate/toast";
import { allowedPaths, isActive } from "@/components/app/nav-config";
import { SidebarContent } from "@/components/app/sidebar-nav";
import { Topbar } from "@/components/app/topbar";
import { useAuth, wasSignedOutOnPurpose } from "@/lib/auth-store";
import { createStore, useStore } from "@/lib/storage-store";
import { cn } from "cn";

const sidebarStore = createStore("sas:sidebar-collapsed", "local");

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useStore(sidebarStore) === "1";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Signed-out visitors go to login and come back here afterwards.
  useEffect(() => {
    if (user !== null) return;
    if (wasSignedOutOnPurpose()) {
      router.replace("/login");
      return;
    }
    const here = pathname + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [user, pathname, router]);

  // A role only opens its own pages; anything else goes back to the dashboard.
  const allowed = !user || allowedPaths(user.roleId).some((p) => isActive(pathname, p));
  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [user, allowed, router]);

  // Close the drawer if the viewport grows past the mobile breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!user || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted" role="status">
        <BrandMark className="animate-pulse" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <ToastProvider>
    <div className="min-h-screen bg-muted">
      <a
        data-print-hide
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside
        data-print-hide
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-background transition-[width] duration-200 lg:block",
          collapsed ? "w-18" : "w-60"
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 lg:hidden" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-background shadow-panel outline-none transition-transform duration-200 data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close navigation"
                  className="absolute top-3 right-3 z-10"
                />
              }
            >
              <XIcon aria-hidden="true" />
            </Dialog.Close>
            <SidebarContent collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <div
        className={cn(
          "app-content min-w-0 transition-[padding] duration-200",
          collapsed ? "lg:pl-18" : "lg:pl-60"
        )}
      >
        <Topbar
          collapsed={collapsed}
          drawerOpen={drawerOpen}
          onToggleCollapsed={() => sidebarStore.set(collapsed ? "0" : "1")}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main id="main" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
