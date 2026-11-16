-- v1.53.0: receituário do cliente (receitas extraídas pela IA ou lançadas pelo atendente).
-- Só cria a tabela nova (nenhum dado existente é alterado).
BEGIN;
CREATE TABLE IF NOT EXISTS "CustomerPrescription" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "attachmentUrl" TEXT,
    "odEsferico" TEXT,
    "odCilindrico" TEXT,
    "odEixo" TEXT,
    "odAdicao" TEXT,
    "odDnp" TEXT,
    "oeEsferico" TEXT,
    "oeCilindrico" TEXT,
    "oeEixo" TEXT,
    "oeAdicao" TEXT,
    "oeDnp" TEXT,
    "dpTotal" TEXT,
    "tipoLenteSugerido" TEXT,
    "observacoes" TEXT,
    "medicoNome" TEXT,
    "medicoCrm" TEXT,
    "dataReceita" TIMESTAMP(3),
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "conferidoPorHumano" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerPrescription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerPrescription_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPrescription_messageId_key" ON "CustomerPrescription"("messageId");
CREATE INDEX IF NOT EXISTS "CustomerPrescription_contactId_createdAt_idx" ON "CustomerPrescription"("contactId", "createdAt");
COMMIT;
