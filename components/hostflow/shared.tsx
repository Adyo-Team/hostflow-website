"use client";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { CircleDashed, type LucideIcon } from "lucide-react";
import {
  roles,
  roleLabels,
  type Role,
  type StoredRole,
} from "@/lib/hostflow/types";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      prefetch={false}
      href="/"
      aria-label="HostFlow — Accueil"
      className={"hf-brand " + (light ? "text-white" : "text-[#123e32]")}
    >
      <Image
        className="hf-mark"
        src="/favicon.svg"
        width={35}
        height={35}
        alt=""
        unoptimized
      />
      HostFlow<span className="text-[#409e7b]">.</span>
    </Link>
  );
}
export function Field({
  label,
  id,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; id: string }) {
  return (
    <div className="hf-field">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
export function RoleSelect({
  value,
  onChange,
  disabled = false,
  options = [...roles],
}: {
  value: StoredRole;
  options?: Role[];
  onChange: (role: Role) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as Role)}
      disabled={disabled}
    >
      <SelectTrigger aria-label="Rôle" className="w-full h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((r) => (
          <SelectItem value={r} key={r}>
            {roleLabels[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Choice({
  label,
  value,
  onChange,
  items,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
  disabled?: boolean;
}) {
  return (
    <div className="hf-field">
      <label>{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label} className="w-full h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map(([v, l]) => (
            <SelectItem value={v} key={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function EmptyState({
  icon: Icon = CircleDashed,
  title,
  description,
  children,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Empty
      className="py-10 gap-5"
      style={compact ? { padding: 24 } : undefined}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-[#eff5f2] text-[#4e7d69] size-12 rounded-xl"
        >
          <Icon className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-[15px] font-semibold">{title}</EmptyTitle>
        <EmptyDescription className="text-sm max-w-[310px]">
          {description}
        </EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  );
}
export const timezoneItems: [string, string][] = [
  ["Europe/Brussels", "Bruxelles · Europe/Brussels"],
  ["Europe/Paris", "Paris · Europe/Paris"],
  ["Africa/Casablanca", "Maroc · Africa/Casablanca"],
  ["Europe/London", "Londres · Europe/London"],
  ["America/New_York", "New York · America/New_York"],
];
export const currencyItems: [string, string][] = [
  ["EUR", "EUR · Euro"],
  ["USD", "USD · Dollar US"],
  ["GBP", "GBP · Livre sterling"],
  ["MAD", "MAD · Dirham marocain"],
  ["CHF", "CHF · Franc suisse"],
  ["CAD", "CAD · Dollar canadien"],
];

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join("")
    .toUpperCase();
}

export const countryItems: [string, string][] = [
  ["BE", "Belgique"],
  ["FR", "France"],
  ["MA", "Maroc"],
  ["CH", "Suisse"],
  ["CA", "Canada"],
  ["US", "États-Unis"],
  ["GB", "Royaume-Uni"],
  ["LU", "Luxembourg"],
  ["NL", "Pays-Bas"],
  ["DE", "Allemagne"],
  ["ES", "Espagne"],
  ["IT", "Italie"],
  ["PT", "Portugal"],
  ["AE", "Émirats arabes unis"],
  ["TN", "Tunisie"],
  ["DZ", "Algérie"],
];
