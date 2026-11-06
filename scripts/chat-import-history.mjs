/**
 * Importa InboundMessage e CampaignMessage para o modelo do Atendimento.
 *
 * Idempotente: cada contato ganha no máximo uma conversa encerrada de histórico
 * (id `import-<contactId>`) e cada mensagem tem id derivado da origem.
 * Só grava em ChatConversation e ChatMessage; as tabelas de origem não mudam.
 *
 * Uso: DB_HOST=... DB_PORT=... DB_NAME=... DB_USER=... DB_PASSWORD=... node scripts/chat-import-history.mjs
 */
import "dotenv/config";
import { Pool } from "pg";

const DIRECT_HOST = process.env.DIRECT_DB_HOST || process.env.DB_HOST;
const DIRECT_PORT = process.env.DIRECT_DB_PORT || process.env.DB_PORT;

const pool = new Pool({
  host: DIRECT_HOST,
  port: Number(DIRECT_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const conversations = await client.query(`
    WITH history AS (
      SELECT "contactId", "receivedAt" AS at, "receivedAt" AS inbound_at FROM "InboundMessage" WHERE "contactId" IS NOT NULL
      UNION ALL
      SELECT "contactId", COALESCE("sentAt", "createdAt"), NULL FROM "CampaignMessage"
      WHERE "contactId" IS NOT NULL AND status <> 'queued'
    ), summary AS (
      SELECT "contactId", MIN(at) AS first_at, MAX(at) AS last_at, MAX(inbound_at) AS last_inbound
      FROM history
      GROUP BY "contactId"
    )
    INSERT INTO "ChatConversation" (id, "contactId", phone, status, "lastMessageAt", "lastInboundAt", "closedAt", "createdAt", "updatedAt")
    SELECT 'import-' || s."contactId", s."contactId", COALESCE(NULLIF(c.phone, ''), ''), 'closed',
           s.last_at, s.last_inbound, s.last_at, s.first_at, s.last_at
    FROM summary s
    JOIN "Contact" c ON c.id = s."contactId"
    ON CONFLICT DO NOTHING
  `);

  const inbound = await client.query(`
    INSERT INTO "ChatMessage" (id, "conversationId", author, text, attachment, "externalId", "createdAt")
    SELECT 'import-in-' || m.id, 'import-' || m."contactId", 'customer',
           COALESCE(m.text, CASE WHEN m."mediaType" IS NOT NULL THEN '[' || m."mediaType" || ']' ELSE '' END),
           NULL, m."whatsappMsgId", m."receivedAt"
    FROM "InboundMessage" m
    JOIN "ChatConversation" c ON c.id = 'import-' || m."contactId"
    ON CONFLICT DO NOTHING
  `);

  const campaign = await client.query(`
    INSERT INTO "ChatMessage" (id, "conversationId", author, "authorName", text, delivery, "failureReason", "externalId", "createdAt")
    SELECT 'import-out-' || m.id, 'import-' || m."contactId", 'bot', 'Campanha', '[Mensagem de campanha]',
           (CASE m.status::text
              WHEN 'failed' THEN 'failed'
              WHEN 'read' THEN 'read'
              WHEN 'replied' THEN 'read'
              WHEN 'delivered' THEN 'delivered'
              ELSE 'sent'
            END)::"ChatDelivery",
           m."failureReason", m."whatsappMsgId", COALESCE(m."sentAt", m."createdAt")
    FROM "CampaignMessage" m
    JOIN "ChatConversation" c ON c.id = 'import-' || m."contactId"
    WHERE m.status <> 'queued'
    ON CONFLICT DO NOTHING
  `);

  const orphans = await client.query(`SELECT count(*)::int AS total FROM "InboundMessage" WHERE "contactId" IS NULL`);

  await client.query("COMMIT");
  console.log(`Conversas criadas: ${conversations.rowCount}`);
  console.log(`Mensagens recebidas importadas: ${inbound.rowCount}`);
  console.log(`Mensagens de campanha importadas: ${campaign.rowCount}`);
  console.log(`Recebidas sem contato (não importadas): ${orphans.rows[0].total}`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Importação cancelada, nada foi gravado:", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
