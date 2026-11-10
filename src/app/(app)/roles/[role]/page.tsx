import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoleRosterPage } from "@/components/admin/roles/role-page";
import type { ProfileRoleId } from "@/lib/domain/role-profiles";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

/**
 * Sidebar slugs under /roles. The label is duplicated here on purpose:
 * importing the role store from @/lib/roles would pull its client-side
 * storage into a Server Component. Keep this in sync with nav-config.ts.
 */
const rolePages: Record<string, { roleId: ProfileRoleId; label: string }> = {
  "commission-agent": { roleId: "commission_agent", label: "Commission agent" },
  "weighbridge-operator": { roleId: "weighbridge_operator", label: "Weight bridge operator" },
  marketplace: { roleId: "marketplace", label: "Market place" },
  driver: { roleId: "driver", label: "Driver" },
  trader: { roleId: "trader", label: "Trader" },
};

export function generateStaticParams() {
  return Object.keys(rolePages).map((role) => ({ role }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>;
}): Promise<Metadata> {
  const { role } = await params;
  return { title: rolePages[role]?.label ?? "Role" };
}

export default async function RoleRoutePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const page = rolePages[role];
  if (!page) notFound();
  return <RoleRosterPage roleId={page.roleId} label={page.label} />;
}
