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

export type ContactRfvpView = {
  code: string | null; segment: string | null; updatedAt: string | null;
  scores: { r: number; f: number; v: number; p: number } | null;
  metrics: { daysSinceLastPurchase: number | null; purchases: number; value: number; valueMetric: "total" | "avg"; months: { f: number; v: number; p: number }; punctuality: { due: number; onTime: number; avgDelay: number; maxOverdueDays: number } | null };
};

/** Por que cada nota: "última compra há 12 dias", "68% das parcelas em dia"... */
export function rfvpReasons(rfvp: ContactRfvpView): Record<Pillar, string> {
  const m = rfvp.metrics;
  const money = m.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const p = m.punctuality;
  return {
    r: m.daysSinceLastPurchase === null ? "nunca comprou no VMSet" : m.daysSinceLastPurchase === 0 ? "comprou hoje" : `última compra há ${m.daysSinceLastPurchase} dia(s)`,
    f: `${m.purchases} compra(s) nos últimos ${m.months.f} meses`,
    v: `${money} ${m.valueMetric === "avg" ? "de ticket médio" : "acumulados"} nos últimos ${m.months.v} meses`,
    p: !p || p.due === 0 ? "sem crediário na janela (compras à vista, PIX ou cartão)" : `${Math.round((p.onTime / p.due) * 100)}% de ${p.due} parcela(s) pagas em dia · atraso médio de ${p.avgDelay} dia(s)${p.maxOverdueDays > 0 ? ` · parcela em aberto há ${p.maxOverdueDays} dia(s)` : ""}`,
  };
}

/** Card da matriz RFV-P do contato: código, segmento e o motivo de cada nota ("R = 5 — última compra há 12 dias"). */
export function RfvpDetail({ rfvp }: { rfvp: ContactRfvpView }) {
  const reasons = rfvpReasons(rfvp);
  const segment = rfvp.segment ? RFVP_SEGMENT_BY_KEY[rfvp.segment] : null;
  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Matriz RFV-P</span>
        <RfvpBadge code={rfvp.code} segment={rfvp.segment} size="md" />
        <RfvpSegmentChip segment={rfvp.segment} />
      </div>
      {segment && <p className="break-words text-xs text-slate-500 dark:text-slate-400">{segment.description}</p>}
      {rfvp.scores ? (
        <ul className="space-y-2">
          {PILLARS.map((pillar) => {
            const score = rfvp.scores![pillar.key];
            return (
              <li key={pillar.key} className="flex min-w-0 items-start gap-2.5">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${SCORE_TONE[score]}`}>{score}</span>
                <span className="min-w-0 break-words text-xs text-slate-600 dark:text-slate-300">
                  <b className="text-[#051647] dark:text-white">{pillar.letter} = {score}</b> <span className="text-slate-400">({pillar.label})</span> — {reasons[pillar.key]}
                </span>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-slate-500 dark:text-slate-400">Ainda não calculado. O recálculo roda todo dia às 6h ou pelo botão Recalcular RFV-P em Clientes VIP.</p>}
    </div>
  );
}

/** Selo do segmento RFV-P com a cor do segmento. */
export function RfvpSegmentChip({ segment }: { segment: string | null | undefined }) {
  if (!segment) return null;
  const meta = RFVP_SEGMENT_BY_KEY[segment];
  return <span className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta?.tone ?? "bg-slate-100 text-slate-600"}`} title={meta?.description}>{segmentLabel(segment)}</span>;
}
