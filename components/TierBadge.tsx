import { Gem } from "lucide-react";
import { isTier, TIER_META } from "@/lib/scoring";

/** Selo do nível do cliente (Diamante, Ouro, Prata, Bronze). */
export function TierBadge({ tier, score, size = "sm" }: { tier: string; score?: number; size?: "sm" | "md" }) {
  const meta = TIER_META[isTier(tier) ? tier : "BRONZE"];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold ring-1 ${meta.badge} ${meta.ring} ${size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]"}`}>
      <Gem className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} aria-hidden />
      {meta.label}
      {score !== undefined && <span className="font-semibold opacity-80">· {score.toLocaleString("pt-BR")} pts</span>}
    </span>
  );
}
