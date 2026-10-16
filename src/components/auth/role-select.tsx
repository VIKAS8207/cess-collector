"use client";

import { ChevronDownIcon, UserCogIcon } from "lucide-react";
import { parseRole, roleStore, roles } from "@/lib/roles";
import { useStore } from "@/lib/storage-store";

export function RoleSelect() {
  const role = parseRole(useStore(roleStore));
  return (
    <div className="relative">
      <label htmlFor="role" className="sr-only">
        Log in as
      </label>
      <UserCogIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <select
        id="role"
        value={role}
        onChange={(e) => roleStore.set(e.target.value)}
        className="h-10 appearance-none rounded-field border border-input bg-background pr-9 pl-9 text-[15px] text-foreground outline-none hover:border-primary focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
