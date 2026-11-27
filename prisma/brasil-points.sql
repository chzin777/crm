-- Brasil Points: gamificação comercial dos vendedores (regras, extrato imutável, prêmios e resgates).
-- Aditivo (expand-only): só cria tabelas/índices novos; nada existente é alterado.

CREATE TABLE IF NOT EXISTS brasil_points_rules (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  type            text NOT NULL CHECK (type IN ('earn', 'penalty')),
  trigger_type    text NOT NULL CHECK (trigger_type IN ('automatic', 'manual')),
  event_key       text NOT NULL,
  points_amount   integer NOT NULL,
  conditions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT false,
  -- Início da vigência (ao ativar): o motor só pontua eventos a partir daqui (sem crédito retroativo).
  active_since    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Extrato: uma linha por movimento, nunca alterada nem apagada; saldo = soma de points.
CREATE TABLE IF NOT EXISTS brasil_points_ledger (
  id             text PRIMARY KEY,
  user_id        text NOT NULL,
  rule_id        text REFERENCES brasil_points_rules(id) ON DELETE SET NULL,
  type           text NOT NULL CHECK (type IN ('earn', 'penalty', 'redeem', 'adjustment')),
  points         integer NOT NULL,
  balance_after  integer NOT NULL,
  reason         text NOT NULL,
  reference_type text NOT NULL CHECK (reference_type IN ('order', 'nps', 'attendance', 'redemption', 'manual')),
  reference_id   text,
  event_key      text NOT NULL,
  store          text,
  created_by     text NOT NULL DEFAULT 'system',
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- Idempotência: o mesmo evento (pedido/NPS/resgate + regra + sequência) nunca entra duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS brasil_points_ledger_event_uq ON brasil_points_ledger (reference_type, reference_id, event_key) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS brasil_points_ledger_user_created_idx ON brasil_points_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brasil_points_ledger_reference_idx ON brasil_points_ledger (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS brasil_points_ledger_created_idx ON brasil_points_ledger (created_at);

CREATE TABLE IF NOT EXISTS brasil_points_rewards (
  id             text PRIMARY KEY,
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  image_url      text,
  points_cost    integer NOT NULL CHECK (points_cost > 0),
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brasil_points_redemptions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL,
  reward_id    text NOT NULL REFERENCES brasil_points_rewards(id),
  points_spent integer NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'delivered', 'rejected')),
  admin_notes  text,
  reviewed_by  text,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brasil_points_redemptions_status_idx ON brasil_points_redemptions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS brasil_points_redemptions_user_idx ON brasil_points_redemptions (user_id, created_at DESC);

-- Regras sugeridas (desligadas: só pontuam depois que a gestão revisar e ativar). Só na primeira instalação.
INSERT INTO brasil_points_rules (id, title, description, type, trigger_type, event_key, points_amount, conditions_json, is_active)
SELECT * FROM (VALUES
  ('bp-rule-venda', 'Venda faturada', 'Cada pedido faturado no VMSet em seu nome.', 'earn', 'automatic', 'sale_completed', 10, '{}'::jsonb, false),
  ('bp-rule-ticket', 'Venda de ticket alto', 'Pedido faturado a partir de R$ 1.500 (só os itens não devolvidos contam).', 'earn', 'automatic', 'sale_high_ticket', 30, '{"minOrderAmount": 1500}'::jsonb, false),
  ('bp-rule-whatsapp', 'Venda pelo WhatsApp do CRM', 'Pedido de cliente que você atendeu no WhatsApp do CRM nos 30 dias antes da compra.', 'earn', 'automatic', 'whatsapp_sale', 20, '{"withinDays": 30}'::jsonb, false),
  ('bp-rule-nps-promotor', 'Cliente promotor no NPS', 'Nota 9 ou 10 na pesquisa do atendimento que você fez.', 'earn', 'automatic', 'nps_promoter', 15, '{}'::jsonb, false),
  ('bp-rule-devolucao', 'Venda devolvida ou cancelada', 'Pedido já pontuado que foi devolvido ou cancelado no VMSet (além do estorno dos pontos da venda).', 'penalty', 'automatic', 'sale_canceled_refund', -10, '{}'::jsonb, false),
  ('bp-rule-nps-detrator', 'Cliente detrator no NPS', 'Nota de 0 a 6 na pesquisa do atendimento que você fez.', 'penalty', 'automatic', 'nps_detractor', -15, '{}'::jsonb, false),
  ('bp-rule-bonus', 'Bônus da gestão', 'Lançamento manual da gestão (com justificativa).', 'earn', 'manual', 'manual_bonus', 50, '{}'::jsonb, true),
  ('bp-rule-desconto', 'Desconto da gestão', 'Lançamento manual da gestão (com justificativa).', 'penalty', 'manual', 'manual_penalty', -50, '{}'::jsonb, true)
) AS seed(id, title, description, type, trigger_type, event_key, points_amount, conditions_json, is_active)
WHERE NOT EXISTS (SELECT 1 FROM brasil_points_rules);
