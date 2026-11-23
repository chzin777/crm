import type { AiSettings } from "@/lib/ai/settings";

/** Conversa com cliente (atendimento e copiloto): criatividade equilibrada para soar natural, sem perder o rumo. */
export const CONVERSATION_TEMPERATURE = 0.65;

/** A de /ia quando a equipe escolheu uma; no "padrão do modelo", 0,65 para as conversas. */
export const conversationTemperature = (settings: Pick<AiSettings, "temperature">) => settings.temperature ?? CONVERSATION_TEMPERATURE;
