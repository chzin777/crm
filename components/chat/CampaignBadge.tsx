import { Megaphone } from "lucide-react";

export function CampaignBadge({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span title={`Respondeu à campanha: ${name}`} className={`inline-flex max-w-full items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 ${className}`}>
      <Megaphone className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
