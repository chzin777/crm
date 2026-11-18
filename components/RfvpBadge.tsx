import { parseRfvpCode, PILLARS, RFVP_SEGMENT_BY_KEY, segmentLabel, type Pillar } from "@/lib/rfvp";

/** Cor de cada nota (1 vermelho → 5 verde elétrico da marca). */
export const SCORE_TONE: Record<number, string> = {
  1: "bg-red-500 text-white",
  2: "bg-[#F7915E] text-[#051647]",
  3: "bg-amber-300 text-[#051647]",
  4: "bg-[#8fb800] text-white",
  5: "bg-[#C4D600] text-[#051647]",
};

/** Badge RFV-P "555-5": cada dígito colorido pela nota; tooltip com os 4 pilares e o segmento. */
export function RfvpBadge({ code, segment, size = "sm" }: { code: string | null | undefined; segment?: string | null; size?: "sm" | "md" }) {
  const scores = parseRfvpCode(code);
  if (!scores) return <span className="text-[11px] text-slate-400" title="RFV-P ainda não calculado">—</span>;
  const title = `${PILLARS.map((pillar) => `${pillar.letter} ${pillar.label}: ${scores[pillar.key]}`).join(" · ")}${segment ? ` — ${segmentLabel(segment)}` : ""}`;
  const cell = size === "md" ? "h-6 w-5 text-xs" : "h-5 w-4 text-[10px]";
  const digit = (pillar: Pillar) => <span key={pillar} className={`grid place-items-center rounded font-bold ${cell} ${SCORE_TONE[scores[pillar]]}`}>{scores[pillar]}</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 font-mono" title={title} aria-label={`RFV-P ${code}. ${title}`}>
      {(["r", "f", "v"] as const).map(digit)}
      <span className="px-0.5 text-slate-400">-</span>
      {digit("p")}
    </span>
  );
}

/** Selo do segmento RFV-P com a cor do segmento. */
export function RfvpSegmentChip({ segment }: { segment: string | null | undefined }) {
  if (!segment) return null;
  const meta = RFVP_SEGMENT_BY_KEY[segment];
  return <span className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta?.tone ?? "bg-slate-100 text-slate-600"}`} title={meta?.description}>{segmentLabel(segment)}</span>;
}
