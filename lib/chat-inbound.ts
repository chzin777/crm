import { prisma } from "@/lib/prisma";

// A tabela InboundMessage e a coluna CampaignMessage.repliedAt podem não existir em ambientes
// cujo schema ainda não foi aplicado. Sem elas o chat funciona, sem as mensagens recebidas.
export async function hasInboundSchema() {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT
      to_regclass('public."InboundMessage"') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CampaignMessage' AND column_name = 'repliedAt'
      ) AS "exists"
  `;
  const exists = rows[0]?.exists === true;
  if (!exists) console.error("[chat] schema de mensagens recebidas ausente; elas não serão exibidas.");
  return exists;
}
