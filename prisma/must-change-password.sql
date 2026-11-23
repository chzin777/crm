-- Troca obrigatória de senha no primeiro acesso. Somente adição: usuários existentes ficam com false (não são bloqueados).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
