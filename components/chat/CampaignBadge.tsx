import { Megaphone } from "lucide-react";

export function CampaignBadge({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span title={`Respondeu à campanha: ${name}`} className={`inline-flex max-w-full items-center gap-1 rounded-md border border-[#C4D600] bg-[#C4D600]/20 px-2 py-0.5 text-xs font-medium text-[#051647] dark:bg-[#C4D600]/10 dark:text-[#C4D600] ${className}`}>
      <Megaphone className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
