"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "@base-ui/react/tooltip";
import { ArrowLeftIcon, ArrowRightIcon, EyeIcon, ShieldCheckIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/app/user-menu";
import { isActive, navByRole, type NavItem } from "@/components/app/nav-config";
import { useAuth } from "@/lib/auth-store";
import { roles } from "@/lib/roles";
import { cn } from "cn";

function NavLink({
  item,
  collapsed,
  nested,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-[5px] text-[15px] outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        collapsed ? "w-10 justify-center" : "w-full px-3",
        nested && !collapsed && "pl-10",
        active
          ? "bg-tag/40 text-primary"
          : "text-foreground hover:bg-muted"
      )}
    >
      <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={link} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={10}>
          <Tooltip.Popup className="z-50 rounded-field bg-foreground px-2.5 py-1.5 text-xs text-background shadow-panel">
            {item.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function NavTree({
  items,
  collapsed,
  nested,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.href} className={cn(collapsed && "flex justify-center")}>
          <NavLink item={item} collapsed={collapsed} nested={nested} onNavigate={onNavigate} />
          {item.children && !collapsed && (
            <NavTree items={item.children} collapsed={false} nested onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function SidebarContent({
  collapsed,
  onNavigate,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  /** Desktop only: shows the open/close control at the bottom of the sidebar. */
  onToggleCollapsed?: () => void;
}) {
  const { user, viewAs } = useAuth();
  const navGroups = navByRole[user?.roleId ?? "gate_operator"];
  return (
    <Tooltip.Provider delay={0}>
      <div className="flex h-full flex-col">
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-border",
            collapsed ? "justify-center" : "px-5"
          )}
        >
          <Link
            href="/dashboard"
            onClick={onNavigate}
            aria-label="CESS Collector home"
            className="inline-flex h-10 items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Brand showName={!collapsed} />
          </Link>
        </div>
        <nav
          aria-label="Main"
          className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-3" : "px-3")}
        >
          {onToggleCollapsed && (
            <div className={cn("mb-4 flex h-10 items-center", collapsed ? "justify-center" : "justify-between pr-1 pl-3")}>
              {!collapsed && <span className="text-[15px] font-semibold text-foreground">Menu</span>}
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
                aria-expanded={!collapsed}
                title={collapsed ? "Open sidebar" : "Close sidebar"}
                className="flex size-10 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {collapsed ? <ArrowRightIcon aria-hidden="true" className="size-[18px]" /> : <ArrowLeftIcon aria-hidden="true" className="size-[18px]" />}
              </button>
            </div>
          )}
          <div className="flex flex-col gap-6">
            {navGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <h2
                  className={cn(
                    "px-3 text-[11px] tracking-[0.4px] text-muted-foreground uppercase",
                    collapsed && "sr-only"
                  )}
                >
                  {group.label}
                </h2>
                <NavTree items={group.items} collapsed={collapsed} onNavigate={onNavigate} />
              </div>
            ))}
            {user?.isAdmin && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <h2 className={cn("px-3 text-[11px] tracking-[0.4px] text-muted-foreground uppercase", collapsed && "sr-only")}>View as role</h2>
                <ul className="flex flex-col gap-1">
                  {roles.map((r) => {
                    const current = user.roleId === r.id;
                    const Icon = r.id === "admin" ? ShieldCheckIcon : EyeIcon;
                    return (
                      <li key={r.id} className={cn(collapsed && "flex justify-center")}>
                        <button
                          type="button"
                          onClick={() => {
                            viewAs(r.id);
                            onNavigate?.();
                          }}
                          aria-pressed={current}
                          title={`View as ${r.label}`}
                          aria-label={r.id === "admin" ? "Switch to Admin" : `View as ${r.label}`}
                          className={cn(
                            "flex h-10 items-center gap-3 rounded-[5px] text-left text-[15px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                            collapsed ? "w-10 justify-center" : "w-full px-3",
                            current ? "bg-tag/40 text-primary" : "text-foreground hover:bg-muted"
                          )}
                        >
                          <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                          <span className={cn("truncate", collapsed && "sr-only")}>{r.id === "admin" ? (current ? "Admin" : "Back to Admin") : r.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </nav>
        <div className={cn("shrink-0 border-t border-border p-3")}>
          <UserMenu variant="sidebar" collapsed={collapsed} />
        </div>
      </div>
    </Tooltip.Provider>
  );
}
