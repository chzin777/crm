import type { AiSettings } from "@/lib/ai/settings";

/** Conversa com cliente (atendimento e copiloto): baixa para não inventar dados factuais (lojas, endereços, serviços). */
export const CONVERSATION_TEMPERATURE = 0.2;

/** Teto fixo nas conversas: a escolha de /ia vale só para baixo (nunca mais criativa que 0,2). */
export const conversationTemperature = (settings: Pick<AiSettings, "temperature">) => Math.min(settings.temperature ?? CONVERSATION_TEMPERATURE, CONVERSATION_TEMPERATURE);
