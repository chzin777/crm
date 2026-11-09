-- Saneamento das conversas fantasmas criadas por avisos de protocolo da Meta (type "system").
-- APAGA DADOS: rodar só com autorização explícita e depois de um pg_dump.
-- Remove a mensagem "[Mensagem do tipo system]" e a conversa somente quando ela não tem
-- nenhuma outra mensagem; se tiver, apenas a mensagem sai e a conversa fica como está.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE ghost ON COMMIT DROP AS
SELECT m.id AS message_id, m."conversationId" AS conversation_id,
       NOT EXISTS (
         SELECT 1 FROM "ChatMessage" o
         WHERE o."conversationId" = m."conversationId" AND o.id <> m.id
       ) AS only_message
FROM "ChatMessage" m
WHERE m.author = 'customer' AND m.text = '[Mensagem do tipo system]';

SELECT * FROM ghost;

DELETE FROM "ChatMessage" WHERE id IN (SELECT message_id FROM ghost);
DELETE FROM "ChatConversation" WHERE id IN (SELECT conversation_id FROM ghost WHERE only_message);

COMMIT;
