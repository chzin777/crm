-- Aditivo: trilha de auditoria de atendimentos humanos e vendas do VMSET.
CREATE TABLE IF NOT EXISTS attendance_sale_attributions (
  id text PRIMARY KEY,
  "conversationId" text NOT NULL REFERENCES "ChatConversation"(id) ON DELETE CASCADE,
  "saleKey" text UNIQUE,
  "sourceKey" text,
  "attendantId" text,
  "attendantName" text,
  "orderNumber" text,
  "invoiceNumber" text,
  "attendanceAt" timestamptz NOT NULL,
  "orderDate" date,
  "saleDate" date,
  store text,
  seller text,
  "customerName" text,
  "netAmount" numeric(14, 2),
  "windowDays" integer NOT NULL DEFAULT 7 CHECK ("windowDays" IN (7, 15)),
  "aiStatus" text NOT NULL DEFAULT 'pending' CHECK ("aiStatus" IN ('pending', 'processing', 'completed', 'failed')),
  "aiQualified" boolean,
  "aiConfidence" integer CHECK ("aiConfidence" IS NULL OR "aiConfidence" BETWEEN 0 AND 100),
  "aiSummary" text,
  "targetStore" text,
  "aiModel" text,
  "aiError" text,
  "aiStartedAt" timestamptz,
  "aiAttempts" integer NOT NULL DEFAULT 0,
  "manualDecision" boolean,
  "reviewNote" text,
  "reviewedById" text REFERENCES "user"(id) ON DELETE SET NULL,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_sale_attributions_conversation_idx
  ON attendance_sale_attributions ("conversationId", "attendanceAt");
CREATE INDEX IF NOT EXISTS attendance_sale_attributions_sale_date_idx
  ON attendance_sale_attributions ("saleDate");
CREATE INDEX IF NOT EXISTS attendance_sale_attributions_store_date_idx
  ON attendance_sale_attributions (store, "saleDate");
CREATE INDEX IF NOT EXISTS attendance_sale_attributions_ai_status_idx
  ON attendance_sale_attributions ("aiStatus", "aiStartedAt");
CREATE UNIQUE INDEX IF NOT EXISTS attendance_sale_attributions_pending_conversation_uq
  ON attendance_sale_attributions ("conversationId") WHERE "saleKey" IS NULL;

CREATE TABLE IF NOT EXISTS attendance_sale_attribution_audit (
  id text PRIMARY KEY,
  "attributionId" text NOT NULL REFERENCES attendance_sale_attributions(id) ON DELETE CASCADE,
  "actorId" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  "previousDecision" boolean,
  decision boolean NOT NULL,
  note text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_sale_attribution_audit_attribution_idx
  ON attendance_sale_attribution_audit ("attributionId", "createdAt");

CREATE TABLE IF NOT EXISTS attendance_sale_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  "attributionWindowDays" integer NOT NULL DEFAULT 7 CHECK ("attributionWindowDays" IN (7, 15)),
  "commissionMode" text NOT NULL DEFAULT 'sale' CHECK ("commissionMode" IN ('sale', 'percentage')),
  "commissionValue" numeric(14, 4) NOT NULL DEFAULT 0 CHECK ("commissionValue" >= 0),
  "lastSyncAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
INSERT INTO attendance_sale_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
