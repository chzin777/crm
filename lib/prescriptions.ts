/**
 * Receituário do cliente: conversão da leitura da IA (foto/PDF) e do formulário do atendente para os campos
 * estruturados de CustomerPrescription. Puro (sem banco): usado pela IA, pelas rotas e pela tela.
 */
import type { DocumentExtraction, EyeRx } from "@/lib/ai/document-extract";

export const PRESCRIPTION_TEXT_FIELDS = [
  "odEsferico", "odCilindrico", "odEixo", "odAdicao", "odDnp",
  "oeEsferico", "oeCilindrico", "oeEixo", "oeAdicao", "oeDnp",
  "dpTotal", "tipoLenteSugerido", "observacoes", "medicoNome", "medicoCrm",
] as const;
export type PrescriptionTextField = (typeof PRESCRIPTION_TEXT_FIELDS)[number];
export type PrescriptionFields = Record<PrescriptionTextField, string | null> & { dataReceita: Date | null };
export type PrescriptionOrigin = "ia_extracao" | "manual";

/** Registro como a tela recebe (datas em ISO). */
export type PrescriptionItem = Record<PrescriptionTextField, string | null> & {
  id: string;
  contactId: string;
  conversationId: string | null;
  messageId: string | null;
  attachmentUrl: string | null;
  dataReceita: string | null;
  origem: PrescriptionOrigin;
  conferidoPorHumano: boolean;
  createdAt: string;
  updatedAt: string;
};

const MAX = { observacoes: 500, default: 80 } as const;
const text = (value: unknown, max: number = MAX.default) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).replace(/\s+/g, " ").trim().slice(0, max);
  return clean || null;
};

/** "13/05/2026", "13-05-26", "2026-05-13" → data (meio-dia UTC, sem virar o dia no fuso); inválida → null. */
export function parsePrescriptionDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(raw);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [day, month, year] = [Number(br[1]), Number(br[2]), Number(br[3].length === 2 ? `20${br[3]}` : br[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || year < 1990 || year > 2100) return null;
  return date;
}

/** "Lentes multifocais" → "Multifocal"; sem pista → null. */
export function lensTypeFrom(...hints: (string | undefined | null)[]): string | null {
  const all = hints.filter(Boolean).join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/multifoca|progressiv/.test(all)) return "Multifocal";
  if (/bifoca/.test(all)) return "Bifocal";
  if (/ocupaciona/.test(all)) return "Ocupacional";
  if (/visao simples|monofoca/.test(all)) return "Visão simples";
  return null;
}

/** Eixo sempre com "°" ("125" → "125°"). */
const axis = (value: unknown) => {
  const clean = text(value);
  return clean && /^\d{1,3}$/.test(clean) ? `${clean}°` : clean;
};

/** Leitura da IA (mesmo JSON da visão e do PDF) → campos da receita. */
export function prescriptionFromExtraction(extraction: DocumentExtraction | undefined): PrescriptionFields {
  const rx = extraction?.receita ?? {};
  const eye = (side: EyeRx | undefined) => ({ esf: text(side?.esferico), cil: text(side?.cilindrico), eixo: axis(side?.eixo), add: text(side?.adicao), dnp: text(side?.dnp) });
  const od = eye(rx.od);
  const oe = eye(rx.oe);
  const extra = rx as { dp?: string; tipoLente?: string };
  const notes = [text(rx.observacoes, MAX.observacoes), text(rx.od?.prisma) && `Prisma OD ${text(rx.od?.prisma)}`, text(rx.oe?.prisma) && `Prisma OE ${text(rx.oe?.prisma)}`].filter(Boolean).join(" · ");
  return {
    odEsferico: od.esf, odCilindrico: od.cil, odEixo: od.eixo, odAdicao: od.add, odDnp: od.dnp,
    oeEsferico: oe.esf, oeCilindrico: oe.cil, oeEixo: oe.eixo, oeAdicao: oe.add, oeDnp: oe.dnp,
    dpTotal: text(extra.dp) ?? text(rx.dnp),
    tipoLenteSugerido: lensTypeFrom(extra.tipoLente, rx.observacoes) ?? (od.add || oe.add ? "Multifocal" : null),
    observacoes: notes || null,
    medicoNome: text(rx.medico),
    medicoCrm: text(rx.crm)?.replace(/^crm[\s:-]*/i, "") ?? null,
    dataReceita: parsePrescriptionDate(rx.data),
  };
}

/** Receita sem nenhum grau nem médico: não vale guardar (foto ilegível). */
export function hasPrescriptionData(fields: Partial<PrescriptionFields>) {
  return PRESCRIPTION_TEXT_FIELDS.some((key) => key !== "observacoes" && key !== "tipoLenteSugerido" && !!fields[key]);
}

/**
 * Corpo do formulário/PATCH do atendente → campos válidos. partial: só o que veio (PATCH). Erro em texto
 * para a resposta 400.
 */
export function parsePrescriptionInput(body: unknown, partial = false): { ok: true; data: Partial<PrescriptionFields> & { conferidoPorHumano?: boolean } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Dados da receita inválidos." };
  const raw = body as Record<string, unknown>;
  const data: Partial<PrescriptionFields> & { conferidoPorHumano?: boolean } = {};
  for (const key of PRESCRIPTION_TEXT_FIELDS) {
    if (partial && !(key in raw)) continue;
    data[key] = key.endsWith("Eixo") ? axis(raw[key]) : text(raw[key], key === "observacoes" ? MAX.observacoes : MAX.default);
  }
  if (!partial || "dataReceita" in raw) {
    const date = raw.dataReceita === null || raw.dataReceita === "" || raw.dataReceita === undefined ? null : parsePrescriptionDate(raw.dataReceita);
    if (raw.dataReceita && !date) return { ok: false, error: "Data da receita inválida (use dd/mm/aaaa)." };
    data.dataReceita = date;
  }
  if ("conferidoPorHumano" in raw) {
    if (typeof raw.conferidoPorHumano !== "boolean") return { ok: false, error: "Campo conferido inválido." };
    data.conferidoPorHumano = raw.conferidoPorHumano;
  }
  if (!partial && !hasPrescriptionData(data)) return { ok: false, error: "Preencha ao menos um grau ou o médico da receita." };
  return { ok: true, data };
}

/** Mais recente primeiro: data da receita (quando há) e, no empate ou sem data, a criação. */
export function sortPrescriptions<T extends { dataReceita: string | Date | null; createdAt: string | Date }>(items: T[]): T[] {
  const time = (value: string | Date | null) => (value ? new Date(value).getTime() : 0);
  return [...items].sort((a, b) => (time(b.dataReceita) || time(b.createdAt)) - (time(a.dataReceita) || time(a.createdAt)) || time(b.createdAt) - time(a.createdAt));
}

/** Receita com mais de 1 ano (alerta de validade na tela). */
export function isPrescriptionExpired(dataReceita: string | Date | null, now = new Date()) {
  if (!dataReceita) return false;
  const issued = new Date(dataReceita);
  const limit = new Date(issued);
  limit.setUTCFullYear(limit.getUTCFullYear() + 1);
  return limit.getTime() < now.getTime();
}

/** Linha para a tela/nota: "Dr. Nasser Bahjat Hajj — CRM 18636". */
export function doctorLine(item: Pick<PrescriptionFields, "medicoNome" | "medicoCrm">) {
  return [item.medicoNome, item.medicoCrm && `CRM ${item.medicoCrm}`].filter(Boolean).join(" — ");
}

/** Registro do banco → JSON da tela. */
export function serializePrescription(row: Record<PrescriptionTextField, string | null> & { id: string; contactId: string; conversationId: string | null; messageId: string | null; attachmentUrl: string | null; dataReceita: Date | null; origem: string; conferidoPorHumano: boolean; createdAt: Date; updatedAt: Date }): PrescriptionItem {
  return {
    ...row,
    origem: row.origem === "ia_extracao" ? "ia_extracao" : "manual",
    dataReceita: row.dataReceita ? row.dataReceita.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
