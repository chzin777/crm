-- Configurações globais das automações (cancelamento automático por conversão). Só adiciona: compatível com Blue/Green.
ALTER TABLE "AutomationFlow" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
