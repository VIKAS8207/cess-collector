"use client";

import { useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/auth/text-field";
import { FormBanner } from "@/components/auth/form-banner";
import type { SupplierProfile } from "@/lib/api/admin";

/** Fixed list: Indian states and union territories. */
const STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Chandigarh",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
];

/** Shown in the City box whatever the state is; the field also accepts any typed city. */
const CITIES = [
  "Mumbai",
  "Pune",
  "Nagpur",
  "Nashik",
  "Bengaluru",
  "Mysuru",
  "Hyderabad",
  "Chennai",
  "Coimbatore",
  "Ahmedabad",
  "Surat",
  "Vadodara",
  "Delhi",
  "Kolkata",
  "Lucknow",
  "Jaipur",
  "Indore",
  "Bhopal",
  "Patna",
  "Kochi",
  "Thiruvananthapuram",
  "Guwahati",
  "Chandigarh",
  "Bhubaneswar",
];

/** The usual commodities; the field also accepts any typed commodity. */
const COMMODITIES = ["Fruits", "Spices", "Vegetables", "Grains", "Oilseeds", "Pulses", "Oil cake"];

const MAX_VEHICLES = 20;

/**
 * Step 1 of the Supplier create flow: the supplier profile. Collects the
 * profile only — `onNext` hands it to step 2, which creates the login.
 */
export function SupplierForm({
  onNext,
  onCancel,
}: {
  onNext: (profile: SupplierProfile) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [commodities, setCommodities] = useState<string[]>([]);
  const [commodityInput, setCommodityInput] = useState("");
  const [vehicleCount, setVehicleCount] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);

  const count = Number(vehicleCount) || 0;
  const plateErrors = plates.map((p) => (p.trim() ? undefined : "Enter the number plate."));
  const errors = {
    name: name.trim() ? undefined : "Enter the full name.",
    state: state ? undefined : "Select a state.",
    city: city.trim() ? undefined : "Enter the city.",
    commodities: commodities.length ? undefined : "Add at least one commodity.",
    vehicles: count >= 1 && count <= MAX_VEHICLES ? undefined : `Enter 1 to ${MAX_VEHICLES} vehicles.`,
    plates: plateErrors.some(Boolean),
  };
  const valid = !errors.name && !errors.state && !errors.city && !errors.commodities && !errors.vehicles && !errors.plates;

  const setCount = (raw: string) => {
    setVehicleCount(raw);
    const n = Number(raw) || 0;
    setPlates((prev) => Array.from({ length: Math.min(n, MAX_VEHICLES) }, (_, i) => prev[i] ?? ""));
  };

  const addCommodity = () => {
    const value = commodityInput.trim();
    if (!value) return;
    setCommodities((prev) => (prev.some((c) => c.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value]));
    setCommodityInput("");
  };

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    onNext({ name: name.trim(), state, city: city.trim(), commodities, plates: plates.map((p) => p.trim().toUpperCase()) });
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

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Supplier</h3>
        <TextField
          id="sf-name"
          label="Full name"
          required
          value={name}
          onChange={setName}
          error={attempted ? errors.name : undefined}
          autoComplete="off"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="sf-state"
            label="State"
            required
            value={state}
            onChange={setState}
            options={[{ value: "", label: "Select a state" }, ...STATES.map((s) => ({ value: s, label: s }))]}
            error={attempted ? errors.state : undefined}
          />
          <TextField
            id="sf-city"
            label="City"
            required
            list="sf-cities"
            value={city}
            onChange={setCity}
            error={attempted ? errors.city : undefined}
            hint="Pick from the list or type any city."
            autoComplete="off"
          />
        </div>
        <datalist id="sf-cities">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Commodity</h3>
        <p className="text-sm text-muted-foreground">Pick the usual ones or type your own, then add.</p>
        <div className="flex flex-wrap gap-2">
          {commodities.map((c) => (
            <Pill key={c} tone="neutral">
              {c}
              <button
                type="button"
                aria-label={`Remove ${c}`}
                onClick={() => setCommodities((prev) => prev.filter((x) => x !== c))}
                className="ml-0.5 rounded-full outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon aria-hidden="true" className="size-3" />
              </button>
            </Pill>
          ))}
          {commodities.length === 0 && <span className="text-sm text-muted-foreground">No commodity added yet.</span>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            id="sf-commodity"
            label="Add a commodity"
            list="sf-commodities"
            value={commodityInput}
            onChange={setCommodityInput}
            error={attempted ? errors.commodities : undefined}
            hint={attempted && errors.commodities ? undefined : "For example Fruits or Spices."}
            autoComplete="off"
            className="min-w-56 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCommodity();
              }
            }}
          />
          <datalist id="sf-commodities">
            {COMMODITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Button type="button" variant="outline" onClick={addCommodity}>
            <PlusIcon aria-hidden="true" />
            Add
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Vehicles</h3>
        <TextField
          id="sf-vehicles"
          label="How many vehicles"
          required
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_VEHICLES}
          value={vehicleCount}
          onChange={setCount}
          error={attempted ? errors.vehicles : undefined}
          hint={`1 to ${MAX_VEHICLES}. The number plate fields appear below.`}
          autoComplete="off"
        />
        {count >= 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {plates.map((plate, i) => (
              <TextField
                key={i}
                id={`sf-plate-${i}`}
                label={`Vehicle ${i + 1} number plate`}
                required
                value={plate}
                onChange={(v) => setPlates((prev) => prev.map((p, j) => (j === i ? v : p)))}
                error={attempted ? plateErrors[i] : undefined}
                placeholder="MH12AB1234"
                autoComplete="off"
              />
            ))}
          </div>
        )}
      </section>

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
