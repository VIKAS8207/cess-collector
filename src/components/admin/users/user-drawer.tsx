"use client";

import { useState } from "react";
import Link from "next/link";
import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { FormBanner } from "@/components/auth/form-banner";
import { SideDrawer } from "@/components/gate/side-drawer";
import { useToast } from "@/components/gate/toast";
import { submitRevokeOtp, submitSendOtp, submitUserActive, submitUserRole, userAudit } from "@/lib/api/admin";
import { getUser, otpLastSent, userRecordCount } from "@/lib/domain/admin-store";
import { config } from "@/lib/domain/settings";
import { useStoreVersion } from "@/lib/domain/store";
import { roleLabel, roles, type RoleId } from "@/lib/roles";
import { formatDate, formatStamp } from "@/lib/format";
import { useCountdown } from "@/hooks/use-countdown";

export function UserDrawer({ id, admin, onClose }: { id: string | null; admin: string; onClose: () => void }) {
  useStoreVersion();
  const user = id ? getUser(id) : undefined;
  return (
    <SideDrawer
      open={!!user}
      onClose={onClose}
      wide
      title={user?.name ?? ""}
      description={
        user && (
          <>
            <Pill tone="brand">{roleLabel(user.role)}</Pill>
            <Pill tone={user.status === "active" ? "neutral" : "danger"}>{user.status === "active" ? "Active" : "Inactive"}</Pill>
            <span>{user.email}</span>
          </>
        )
      }
    >
      {user && <Body key={user.id} userId={user.id} admin={admin} />}
    </SideDrawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-caption text-muted-foreground sm:w-36 sm:shrink-0">{label}</dt>
      <dd className="text-[15px] text-foreground">{value}</dd>
    </div>
  );
}

function Body({ userId, admin }: { userId: string; admin: string }) {
  const user = getUser(userId)!;
  const toast = useToast();
  const records = userRecordCount(user);
  const [role, setRole] = useState<RoleId>(user.role);
  const [savingRole, setSavingRole] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const last = otpLastSent(user.id);
  const wait = useCountdown(last ? last + config.otpCooldownSeconds * 1000 : null);
  const audit = userAudit(user);

  const saveRole = async () => {
    if (role === user.role || savingRole) return;
    setSavingRole(true);
    await submitUserRole(user.id, role, admin);
    setSavingRole(false);
    toast.push(`${user.name} is now ${roleLabel(role)}.`);
  };

  const toggle = async () => {
    const wasActive = user.status === "active";
    setToggling(true);
    await submitUserActive(user.id, !wasActive, admin);
    setToggling(false);
    setConfirmOff(false);
    toast.push(wasActive ? `${user.name} is now inactive.` : `${user.name} is active again.`);
  };

  const send = async () => {
    setSending(true);
    setProblem(null);
    const res = await submitSendOtp(user.id, admin);
    setSending(false);
    if (res.ok) {
      setShown(res.code);
      toast.push("Reset OTP issued. See the mock panel.");
    } else if (res.code === "cooldown") {
      setProblem(`Wait ${res.wait} seconds before sending another code.`);
    } else setProblem("A code can only be sent to an active user.");
  };

  const revoke = async () => {
    setRevoking(true);
    await submitRevokeOtp(user.id, admin);
    setRevoking(false);
    setShown(null);
    toast.push("Reset OTP revoked.");
  };

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="ud-profile">
        <h3 id="ud-profile" className="text-heading-md text-foreground">Profile</h3>
        <dl className="flex flex-col gap-3">
          <Row label="Created" value={`${formatDate(user.createdAt)} by ${user.createdBy}`} />
          <Row label="Last login" value={user.lastLoginAt ? formatStamp(user.lastLoginAt) : "Never"} />
          <Row label="Password reset" value={user.resetState === "otp_sent" ? "OTP sent" : user.resetState === "cleared" ? "Cleared" : "None"} />
          <Row label="Records" value={`${records}`} />
        </dl>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="ud-role">
        <h3 id="ud-role" className="text-heading-md text-foreground">Role</h3>
        <SelectField id="ud-role-select" label="Role" value={role} onChange={(v) => setRole(v as RoleId)} options={roles.map((r) => ({ value: r.id, label: r.label }))} disabled={savingRole} />
        {records > 0 && role !== user.role && (
          <FormBanner tone="info" message={`This user has ${records} records. Role change affects future sessions only.`} />
        )}
        <Button variant="outline" className="sm:self-end" onClick={saveRole} disabled={role === user.role || savingRole} aria-busy={savingRole}>
          {savingRole && <Spinner />}
          Save role
        </Button>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="ud-reset">
        <h3 id="ud-reset" className="text-heading-md text-foreground">Password reset</h3>
        <p className="text-sm text-muted-foreground">
          You never set a password. The user receives a one-time code and sets their own through the forgot-password steps.
        </p>
        <FormBanner message={problem} />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={send} disabled={sending || wait > 0 || user.status !== "active"} aria-busy={sending}>
            {sending ? <Spinner /> : <KeyRoundIcon aria-hidden="true" />}
            {wait > 0 ? `Send again in ${wait}s` : "Send reset OTP"}
          </Button>
          {user.resetState === "otp_sent" && (
            <Button variant="ghost" onClick={revoke} disabled={revoking} aria-busy={revoking}>
              {revoking && <Spinner />}
              Revoke OTP
            </Button>
          )}
        </div>
        {shown && (
          <div role="status" className="flex flex-col gap-3 rounded-card border border-border bg-muted p-4">
            <p className="text-caption text-muted-foreground">Mock only — real system sends email. This code is shown once.</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-display-md tracking-[0.3em] tabular-nums text-foreground">{shown}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(shown);
                  toast.push("Code copied.");
                }}
              >
                <CopyIcon aria-hidden="true" />
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShown(null)}>
                Hide
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="ud-status">
        <h3 id="ud-status" className="text-heading-md text-foreground">Access</h3>
        {user.status === "active" && !confirmOff && (
          <Button variant="outline" className="self-start" onClick={() => setConfirmOff(true)}>
            Deactivate
          </Button>
        )}
        {user.status === "active" && confirmOff && (
          <div role="alertdialog" aria-labelledby="ud-confirm" className="flex flex-col gap-4 rounded-card border border-destructive/50 bg-destructive/5 p-4">
            <p id="ud-confirm" className="text-[15px] text-foreground">
              {user.name} will not be able to log in. Their records stay. You can activate them again later.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={toggle} disabled={toggling} aria-busy={toggling}>
                {toggling && <Spinner />}
                Deactivate
              </Button>
              <Button variant="outline" onClick={() => setConfirmOff(false)} disabled={toggling}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {user.status === "inactive" && (
          <Button className="self-start" onClick={toggle} disabled={toggling} aria-busy={toggling}>
            {toggling && <Spinner />}
            Activate
          </Button>
        )}
        <p className="text-caption text-muted-foreground">Users cannot be deleted. Deactivate instead.</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="ud-activity">
        <h3 id="ud-activity" className="text-heading-md text-foreground">Recent changes</h3>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admin changes for this user yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-col">
                <span className="text-foreground">{a.summary}</span>
                <span className="text-caption text-muted-foreground">
                  {formatStamp(a.at)} · {a.user}
                  {a.oldValue || a.newValue ? ` · ${a.oldValue ?? "—"} → ${a.newValue ?? "—"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/activity?q=${encodeURIComponent(user.name)}&range=90d`} className="text-sm text-primary hover:underline">
          Open in All Activity
        </Link>
      </section>
    </>
  );
}
