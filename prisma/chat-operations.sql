-- v1.17.0: lembretes de retorno, mensagens agendadas e horário de atendimento do /chat.
-- Só cria tabelas novas (nenhum dado existente é alterado). Gerado com prisma migrate diff.
BEGIN;
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduledMessageStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledMessageStatus" NOT NULL DEFAULT 'SCHEDULED',
    "failureReason" TEXT,
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingHours" (
    "scope" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule" JSONB NOT NULL DEFAULT '[]',
    "autoReplyMessage" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingHours_pkey" PRIMARY KEY ("scope")
);

-- CreateIndex
CREATE INDEX "FollowUp_userId_status_dueAt_idx" ON "FollowUp"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "FollowUp_conversationId_status_idx" ON "FollowUp"("conversationId", "status");

-- CreateIndex
CREATE INDEX "FollowUp_status_dueAt_idx" ON "FollowUp"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ScheduledMessage_status_scheduledFor_idx" ON "ScheduledMessage"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledMessage_conversationId_status_idx" ON "ScheduledMessage"("conversationId", "status");

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
