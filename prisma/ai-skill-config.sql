-- Parâmetros técnicos editáveis por skill (ex.: "Envio e Leitura de Fotos": máximo de fotos por vitrine e busca de
-- foto na web). Aditivo (expand-only): a versão anterior do app ignora a coluna.
ALTER TABLE "AiSkill" ADD COLUMN IF NOT EXISTS "config" jsonb NOT NULL DEFAULT '{}'::jsonb;
