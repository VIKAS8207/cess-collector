"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  MenuIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserMenu } from "@/components/app/user-menu";
import { findPage } from "@/components/app/nav-config";
import { cn } from "cn";

const UNREAD = 3;

export function Topbar({
  drawerOpen,
  onOpenDrawer,
}: {
  drawerOpen: boolean;
  onOpenDrawer: () => void;
}) {
  const pathname = usePathname();
  const page = findPage(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const desktopSearch = useRef<HTMLInputElement>(null);
  const mobileSearch = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K focuses search (opens the compact search on small screens).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (window.matchMedia("(min-width: 768px)").matches) {
        desktopSearch.current?.focus();
      } else {
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) mobileSearch.current?.focus();
  }, [searchOpen]);

  return (
    <header data-print-hide className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background px-3 sm:px-6">
      {searchOpen && (
        <div className="flex flex-1 items-center gap-2 md:hidden">
          <div className="relative flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={mobileSearch}
              type="search"
              aria-label="Search"
              placeholder="Search"
              className="pl-9"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className={cn("flex min-w-0 flex-1 items-center gap-2", searchOpen && "max-md:hidden")}>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={onOpenDrawer}
        >
          <MenuIcon aria-hidden="true" />
        </Button>
        {page?.parent ? (
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-2 text-[15px]">
              <li className="truncate text-muted-foreground">{page.parent.label}</li>
              <li aria-hidden="true" className="text-muted-foreground">
                /
              </li>
              <li aria-current="page" className="truncate text-foreground">
                {page.item.label}
              </li>
            </ol>
          </nav>
        ) : (
          <p className="truncate text-[17px] tracking-[-0.2px] text-foreground">
            {page?.item.label ?? "CESS Collector"}
          </p>
        )}

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="relative hidden md:block">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={desktopSearch}
              type="search"
              aria-label="Search"
              aria-keyshortcuts="Control+K Meta+K"
              placeholder="Search"
              className="w-56 pr-12 pl-9 lg:w-72"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-xs border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground lg:block"
            >
              Ctrl K
            </kbd>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications, ${UNREAD} unread`}
          >
            <BellIcon aria-hidden="true" />
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground tabular-nums"
            >
              {UNREAD}
            </span>
          </Button>
          <UserMenu variant="topbar" />
        </div>
      </div>
    </header>
  );
}
