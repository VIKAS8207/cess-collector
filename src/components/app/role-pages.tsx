"use client";

import { AdminDashboard } from "@/components/admin/dashboard/admin-dashboard";
import { AdminReportPage } from "@/components/admin/report/admin-report-page";
import { SettingsPage } from "@/components/admin/settings/settings-page";
import { AgentDashboard } from "@/components/agent/dashboard/agent-dashboard";
import { SalesPage } from "@/components/sales/sales-page";
import { TraderDashboard } from "@/components/trader/dashboard/trader-dashboard";
import { TraderReportPage } from "@/components/trader/report/trader-report-page";
import { TraderSalesPage } from "@/components/trader/sales/trader-sales-page";
import { AgentReportPage } from "@/components/agent/report/agent-report-page";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { ReportPage } from "@/components/report/report-page";
import { useAuth } from "@/lib/auth-store";

/** Same URL, different page per role. */
export function RoleDashboard() {
  const { user } = useAuth();
  if (user?.roleId === "commission_agent") return <AgentDashboard />;
  if (user?.roleId === "trader") return <TraderDashboard />;
  if (user?.roleId === "admin") return <AdminDashboard />;
  return <DashboardPage />;
}

export function RoleReport() {
  const { user } = useAuth();
  if (user?.roleId === "commission_agent") return <AgentReportPage />;
  if (user?.roleId === "trader") return <TraderReportPage />;
  if (user?.roleId === "admin") return <AdminReportPage />;
  return <ReportPage />;
}

export function RoleSales() {
  const { user } = useAuth();
  return user?.roleId === "trader" ? <TraderSalesPage /> : <SalesPage />;
}

/** Settings is a real page for the admin and a placeholder for everyone else. */
export function RoleSettings() {
  const { user } = useAuth();
  if (user?.roleId === "admin") return <SettingsPage />;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg text-foreground">Settings</h1>
      <p className="text-body-md text-muted-foreground">This page is not built yet for your role.</p>
    </div>
  );
}
