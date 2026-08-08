import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowLeft, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold tracking-wide text-[#2F855A]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl font-bold tracking-tight text-[#173B2D] sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm leading-6 text-[#607368]">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-[#173B2D]">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-[#718377]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

const statTone = {
  green: "bg-[#E8F3EC] text-[#17663B]",
  blue: "bg-[#EAF3FA] text-[#256D95]",
  amber: "bg-[#FFF4DE] text-[#A76009]",
  red: "bg-[#FDECEC] text-[#B83A3A]",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "green",
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: keyof typeof statTone;
  hint?: string;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#E5EDE7] bg-white p-4 shadow-[0_1px_2px_rgba(23,59,45,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#718377]">{label}</p>
          <p className="mt-2 break-words text-2xl font-extrabold text-[#173B2D]">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-[#718377]">{hint}</p>}
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", statTone[tone])}>
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>
    </section>
  );
}

export function QuickActionCard({
  label,
  description,
  icon: Icon,
  onClick,
  tone = "green",
}: {
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "green" | "blue" | "amber";
}) {
  const tones = {
    green: "border-[#D6E9DB] hover:border-[#2F855A] hover:bg-[#F5FAF6]",
    blue: "border-[#D9EAF5] hover:border-[#3A82AB] hover:bg-[#F5FAFD]",
    amber: "border-[#F5E2BF] hover:border-[#C27B16] hover:bg-[#FFF9EF]",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-28 w-full items-start gap-3 rounded-2xl border bg-white p-4 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A] focus-visible:ring-offset-2",
        tones[tone]
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F1F7F2] text-[#17663B] group-hover:bg-[#E2F0E5]">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-sm font-bold text-[#173B2D]">
          {label}
          <ArrowLeft className="size-4 shrink-0 text-[#7B8E81]" aria-hidden="true" />
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#718377]">{description}</span>
      </span>
    </button>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[#D6E4D9] bg-[#FBFDFC] p-7 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#EEF6F0] text-[#2F855A]">
        <Icon size={21} aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-sm font-bold text-[#173B2D]">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-6 text-[#718377]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
