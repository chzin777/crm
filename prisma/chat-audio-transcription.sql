-- v1.68.0: transcrição dos áudios recebidos no atendimento (aditivo, compatível com Blue/Green).
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "transcription" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "transcriptionStatus" TEXT;
