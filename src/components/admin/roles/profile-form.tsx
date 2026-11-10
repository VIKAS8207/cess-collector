"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/auth/text-field";
import { FormBanner } from "@/components/auth/form-banner";
import { profileConfigs, type ProfileField, type ProfileRoleId } from "@/lib/domain/role-profiles";

function fieldError(f: ProfileField, raw: string): string | undefined {
  const value = f.upper ? raw.trim().toUpperCase().replace(/\s+/g, "") : raw.trim();
  if (!value) return f.required ? `Enter ${f.label.toLowerCase()}.` : undefined;
  if (f.kind === "number") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < (f.min ?? 0)) return `Enter ${f.label.toLowerCase()} as a number.`;
    if (f.max !== undefined && n > f.max) return `Use ${f.max} or less.`;
  }
  return f.check?.(value);
}

/**
 * Step 1 of the create flow for every role that has a profile. The fields come
 * from `profileConfigs`, so a role's form is changed in one place.
 */
export function ProfileForm({
  role,
  onNext,
  onCancel,
}: {
  role: ProfileRoleId;
  onNext: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const config = profileConfigs[role];
  const all = config.sections.flatMap((s) => s.fields);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(all.map((f) => [f.key, ""])));
  const [attempted, setAttempted] = useState(false);

  const errors = Object.fromEntries(all.map((f) => [f.key, fieldError(f, values[f.key])]));
  const valid = all.every((f) => !errors[f.key]);
  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    onNext(Object.fromEntries(all.map((f) => [f.key, values[f.key].trim()])));
  };

  const render = (f: ProfileField) => {
    const id = `pf-${role}-${f.key}`;
    const error = attempted ? errors[f.key] : undefined;
    const value = values[f.key];
    if (f.kind === "select") {
      return (
        <SelectField
          key={f.key}
          id={id}
          label={f.label}
          required={f.required}
          value={value}
          onChange={(v) => set(f.key, v)}
          options={[{ value: "", label: `Select ${f.label.toLowerCase()}` }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]}
          error={error}
          hint={f.hint}
        />
      );
    }
    if (f.kind === "textarea") {
      return (
        <div key={f.key} className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor={id} className="text-sm text-foreground">
            {f.label}
            {f.required && (
              <span aria-hidden="true" className="text-destructive">
                {" "}
                *
              </span>
            )}
          </label>
          <Textarea id={id} name={id} value={value} onChange={(e) => set(f.key, e.target.value)} aria-invalid={error ? true : undefined} />
          {error && <p className="text-sm text-foreground">{error}</p>}
        </div>
      );
    }
    return (
      <TextField
        key={f.key}
        id={id}
        label={f.label}
        required={f.required}
        type={f.kind === "tel" ? "tel" : f.kind}
        inputMode={f.kind === "tel" || f.kind === "number" ? "numeric" : undefined}
        min={f.min}
        max={f.max}
        placeholder={f.placeholder}
        hint={f.hint}
        value={value}
        onChange={(v) => set(f.key, v)}
        error={error}
        autoComplete="off"
      />
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FormBanner message={attempted && !valid ? "Fill the highlighted fields to continue." : null} />

      {config.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-4">
          <h3 className="text-heading-md text-foreground">{section.title}</h3>
          {section.hint && <p className="text-sm text-muted-foreground">{section.hint}</p>}
          <div className="grid gap-4 sm:grid-cols-2">{section.fields.map(render)}</div>
        </section>
      ))}

      <div className="flex flex-wrap gap-3 sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg">
          Next
        </Button>
      </div>
    </form>
  );
}
