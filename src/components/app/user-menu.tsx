"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { cn } from "cn";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag text-xs text-tag-foreground"
    >
      {initials(name)}
    </span>
  );
}

const itemClass =
  "flex h-10 w-full cursor-default items-center gap-2 rounded-field px-3 text-sm outline-none select-none data-[highlighted]:bg-muted";

export function UserMenu({
  variant,
  collapsed = false,
}: {
  variant: "sidebar" | "topbar";
  collapsed?: boolean;
}) {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const trigger =
    variant === "topbar" ? (
      <Menu.Trigger
        aria-label={`Account menu for ${user.name}`}
        className="flex size-10 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted"
      >
        <Avatar name={user.name} />
      </Menu.Trigger>
    ) : (
      <Menu.Trigger
        aria-label={collapsed ? `Account menu for ${user.name}` : undefined}
        className={cn(
          "flex h-12 items-center gap-3 rounded-full text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted",
          collapsed ? "mx-auto w-12 justify-center" : "w-full px-2"
        )}
      >
        <Avatar name={user.name} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{user.name}</span>
              <span className="block truncate text-caption text-muted-foreground">
                {user.role}
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </Menu.Trigger>
    );

  return (
    <Menu.Root>
      {trigger}
      <Menu.Portal>
        <Menu.Positioner
          side={variant === "topbar" ? "bottom" : "top"}
          align={variant === "topbar" ? "end" : "start"}
          sideOffset={8}
          className="z-50"
        >
          <Menu.Popup className="min-w-52 rounded-card border border-border bg-popover p-1.5 text-popover-foreground shadow-panel outline-none">
            <div className="px-3 py-2">
              <p className="truncate text-sm text-foreground">{user.name}</p>
              <p className="truncate text-caption text-muted-foreground">{user.email}</p>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item className={itemClass} render={<Link href="/profile" />}>
              <UserIcon aria-hidden="true" className="size-4" />
              Profile
            </Menu.Item>
            <Menu.Item className={itemClass} render={<Link href="/settings" />}>
              <SettingsIcon aria-hidden="true" className="size-4" />
              Settings
            </Menu.Item>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item className={itemClass} onClick={signOut}>
              <LogOutIcon aria-hidden="true" className="size-4" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
