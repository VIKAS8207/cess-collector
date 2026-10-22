import {
  BoxesIcon,
  DatabaseIcon,
  HistoryIcon,
  UsersRoundIcon,
  FileBarChartIcon,
  WalletIcon,
  ShoppingCartIcon,
  LayoutDashboardIcon,
  LogInIcon,
  LogOutIcon,
  ScaleIcon,
  SplitIcon,
  TruckIcon,
  UserIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import type { RoleId } from "@/lib/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Nested items render indented under the parent when the sidebar is expanded. */
  children?: NavItem[];
};

export type NavGroup = { label: string; items: NavItem[] };

const dashboard: NavItem = { label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon };

/**
 * Sidebar per role. Adding a role is a config change only: add its id to
 * `roles` and an entry here.
 */
export const navByRole: Record<RoleId, NavGroup[]> = {
  gate_operator: [
    { label: "Overview", items: [dashboard] },
    {
      label: "Gate",
      items: [
        { label: "Gate Entry", href: "/gate-entry", icon: LogInIcon },
        { label: "Gate Exit", href: "/gate-exit", icon: LogOutIcon },
        { label: "All Vehicles", href: "/vehicles", icon: TruckIcon },
      ],
    },
    { label: "Insights", items: [{ label: "Report", href: "/report", icon: FileBarChartIcon }] },
  ],
  weighbridge_operator: [
    { label: "Overview", items: [dashboard] },
    { label: "Weighing", items: [{ label: "Weight Bridge", href: "/weight-bridge", icon: ScaleIcon }] },
  ],
  commission_agent: [
    { label: "Overview", items: [dashboard] },
    {
      label: "Trading",
      items: [
        { label: "Allocate to Traders", href: "/allocations", icon: SplitIcon },
        { label: "Sales", href: "/sales", icon: ShoppingCartIcon },
      ],
    },
    { label: "Insights", items: [{ label: "Report", href: "/report", icon: FileBarChartIcon }] },
  ],
  admin: [
    { label: "Overview", items: [dashboard] },
    {
      label: "Admin",
      items: [
        { label: "Users & Roles", href: "/users", icon: UsersRoundIcon },
        { label: "Settings", href: "/settings", icon: SettingsIcon },
        { label: "Masters", href: "/masters", icon: DatabaseIcon },
        { label: "All Activity", href: "/activity", icon: HistoryIcon },
      ],
    },
    { label: "Insights", items: [{ label: "Report", href: "/report", icon: FileBarChartIcon }] },
  ],
  trader: [
    { label: "Overview", items: [dashboard] },
    {
      label: "Trading",
      items: [
        { label: "My Stock", href: "/my-stock", icon: BoxesIcon },
        { label: "Sales", href: "/sales", icon: ShoppingCartIcon },
        { label: "Collections", href: "/collections", icon: WalletIcon },
      ],
    },
    { label: "Insights", items: [{ label: "Report", href: "/report", icon: FileBarChartIcon }] },
  ],
};

/** Pages reachable from menus but not shown in the sidebar. */
const extraPages: NavItem[] = [
  { label: "Profile", href: "/profile", icon: UserIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

function flatten(items: NavItem[], parent?: NavItem): { item: NavItem; parent?: NavItem }[] {
  return items.flatMap((item) => [{ item, parent }, ...flatten(item.children ?? [], item)]);
}

const allPages = flatten([
  ...Object.values(navByRole).flatMap((groups) => groups.flatMap((g) => g.items)),
  ...extraPages,
]);

export function findPage(pathname: string) {
  return allPages
    .filter(({ item }) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.item.href.length - a.item.href.length)[0];
}

/** Routes a role may open: its sidebar items plus the shared menu pages. */
export function allowedPaths(roleId: RoleId): string[] {
  return [
    ...navByRole[roleId].flatMap((g) => flatten(g.items).map((x) => x.item.href)),
    ...extraPages.map((p) => p.href),
  ];
}

export const sectionSlugs = extraPages.map((p) => p.href.slice(1));

export function isKnownSection(slug: string) {
  return sectionSlugs.includes(slug);
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
