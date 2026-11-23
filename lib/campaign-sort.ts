/** Ordenação da lista de /campanhas (sem banco: usada na tela e nos testes). */
export type CampaignSortField = "nome" | "mensagem" | "publico" | "status" | "total" | "enviados" | "respostas" | "atualizacao";

export type SortableCampaignRow = {
  nome: string;
  mensagem: string;
  publico: string;
  status: string;
  total: number;
  updatedAt: number;
  stats: { sent: number; replied: number };
  job?: { startedAt?: string | null } | null;
  bulk?: { createdAt?: string | null } | null;
};

/** Início do disparo em andamento (job do worker ou envio em massa); sem data, a última atualização. */
const sendingStart = (row: SortableCampaignRow) => {
  const started = new Date(row.job?.startedAt ?? row.bulk?.createdAt ?? 0).getTime();
  return Number.isNaN(started) || started === 0 ? row.updatedAt : started;
};

/** "Enviando" sempre no topo (mais recente primeiro); o resto segue o campo e a direção escolhidos. */
export function sortCampaignRows<T extends SortableCampaignRow>(rows: T[], field: CampaignSortField, order: "asc" | "desc"): T[] {
  return [...rows].sort((a, b) => {
    const aSending = a.status === "Enviando";
    const bSending = b.status === "Enviando";
    if (aSending !== bSending) return aSending ? -1 : 1;
    if (aSending) return sendingStart(b) - sendingStart(a);
    const dir = order === "asc" ? 1 : -1;
    switch (field) {
      case "nome": return dir * a.nome.localeCompare(b.nome, "pt-BR");
      case "mensagem": return dir * a.mensagem.localeCompare(b.mensagem, "pt-BR");
      case "publico": return dir * a.publico.localeCompare(b.publico, "pt-BR");
      case "status": return dir * a.status.localeCompare(b.status, "pt-BR");
      case "total": return dir * (a.total - b.total);
      case "enviados": return dir * (a.stats.sent - b.stats.sent);
      case "respostas": return dir * (a.stats.replied - b.stats.replied);
      case "atualizacao": return dir * (a.updatedAt - b.updatedAt);
      default: return 0;
    }
  });
}
