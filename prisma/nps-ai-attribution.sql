-- Expand-only: o app antigo continua podendo gravar pesquisas sem autoria identificada.
ALTER TABLE "NpsFeedback" ADD COLUMN IF NOT EXISTS "responderType" TEXT;

-- Apenas ciclos com evidência inequívoca de resposta da IA e sem intervenção humana.
UPDATE "NpsFeedback" n
SET "responderType" = 'ai'
FROM "ChatConversation" c
WHERE n."conversationId" = c.id
  AND n.source = 'chat'
  AND n."surveyType" = 'ATENDIMENTO'
  AND n."attendantId" IS NULL
  AND n."responderType" IS NULL
  AND (c."assigneeId" IS NULL OR EXISTS (
    SELECT 1 FROM "ChatAudit" r
    WHERE r."targetId" = c.id AND r.action = 'conversation.reopen' AND r."createdAt" > n."createdAt"
  ))
  AND EXISTS (
    SELECT 1 FROM "ChatMessage" m
    WHERE m."conversationId" = c.id AND m.author = 'bot' AND m."authorName" = 'Assistente IA'
      AND m.internal = false AND m.delivery IN ('sent', 'delivered', 'read')
      AND m."createdAt" <= n."createdAt"
      AND m."createdAt" >= COALESCE(
        (SELECT MAX(a."createdAt") FROM "ChatAudit" a WHERE a."targetId" = c.id AND a.action = 'conversation.reopen' AND a."createdAt" <= n."createdAt"),
        c."createdAt")
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ChatMessage" m
    WHERE m."conversationId" = c.id AND m."createdAt" <= n."createdAt"
      AND m."createdAt" >= COALESCE(
        (SELECT MAX(a."createdAt") FROM "ChatAudit" a WHERE a."targetId" = c.id AND a.action = 'conversation.reopen' AND a."createdAt" <= n."createdAt"),
        c."createdAt")
      AND ((m.author = 'agent' AND m.internal = false)
        OR (m.author = 'system' AND (m.text LIKE 'Menu automático atribuiu a %' OR m.text LIKE 'Rodízio da fila % atribuiu a %' OR m.text LIKE 'IA atribuiu a %')))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ChatAudit" a
    WHERE a."targetId" = c.id AND a."createdAt" <= n."createdAt"
      AND a."createdAt" >= COALESCE(
        (SELECT MAX(r."createdAt") FROM "ChatAudit" r WHERE r."targetId" = c.id AND r.action = 'conversation.reopen' AND r."createdAt" <= n."createdAt"),
        c."createdAt")
      AND (a.action IN ('conversation.assume', 'conversation.reopen')
        OR (a.action IN ('conversation.transfer', 'conversation.ai_resume') AND (a."after"->>'assigneeId' IS NOT NULL OR a."before"->>'assigneeId' IS NOT NULL)))
  );
