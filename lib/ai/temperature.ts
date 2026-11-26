import type { AiSettings } from "@/lib/ai/settings";

/** Temperatura padrão das conversas quando /ia está em "padrão": baixa, para não inventar dados factuais. */
export const CONVERSATION_TEMPERATURE = 0.2;

/** A escolhida no slider de /ia (0 a 1) vale como está; sem escolha, 0,2. */
export const conversationTemperature = (settings: Pick<AiSettings, "temperature">) => settings.temperature ?? CONVERSATION_TEMPERATURE;
