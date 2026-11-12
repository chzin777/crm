import { addDays, brDay, brStartOfDay, formatBr } from "@/lib/br-time";

export function relativeTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes}min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  return formatBr(date, { day: "2-digit", month: "short" });
}

/** O dia do atendimento é o de Brasília, não o do fuso do servidor. */
export function startOfBrazilDay() {
  return brStartOfDay();
}

/** O ERP grava CPF sem zeros à esquerda; valor fora do padrão aparece como veio. */
export function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").padStart(11, "0");
  return digits.length === 11 ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : value;
}

export const clockTime = (value: string) => formatBr(value, { hour: "2-digit", minute: "2-digit" });

/** "Hoje", "Ontem" ou a data, pelos dias de Brasília. */
export function dayLabel(value: string, now: Date = new Date()) {
  const day = brDay(new Date(value));
  const today = brDay(now);
  if (day === today) return "Hoje";
  if (day === addDays(today, -1)) return "Ontem";
  return formatBr(value, { day: "2-digit", month: "long", year: "numeric" });
}

export function waitingLabel(since: string | null) {
  if (!since) return { text: "", minutes: 0 };
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  return { text: elapsedLabel(minutes), minutes };
}

/** 15min, 4h 20min, 2d 18h: acima de 24h a conta vira dias para não mostrar "66h". */
export function elapsedLabel(minutes: number) {
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}min` : `${hours}h`;
  return hours % 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${Math.floor(hours / 24)}d`;
}

export const initials = (name: string) => name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
