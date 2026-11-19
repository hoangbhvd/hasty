import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const base = "brutal-input w-full px-3 text-base";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Select({ className, options, ...p }: React.ComponentProps<"select"> & { options: { value: string; label: string }[] }) {
  return (
    <select {...p} className={cn(base, "h-11", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Textarea({ className, ...p }: React.ComponentProps<"textarea">) {
  return <textarea {...p} className={cn(base, "min-h-24 py-2", className)} />;
}

export function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5 accent-foreground" />
      {label}
    </label>
  );
}
