-- Cargo "Vendedor": app de celular na visão de vendedor (só as próprias vendas e meta, pelo vendedor do VMSet ligado ao usuário).
-- Somente adição; se o cargo já existir, nada muda (permissões seguem configuráveis em /permissoes).
INSERT INTO "Role" (id, name, description, permissions, "isSystem", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'Vendedor',
  'Vendedor de loja: atende, acompanha o funil e vê as próprias vendas e meta no app',
  '{"painel": false, "pipelines": true, "contatos": true, "segmentos": false, "produtos": true, "vendas": false, "campanhas": false, "disparos": false, "modelos": false, "nps": false, "automacoes": false, "pontuacao": false, "lojas": false, "metas": false, "premiacoes": false, "usuarios": false, "permissoes": false, "chat": true, "filas": false, "respostas": false, "metricas": false, "configuracoes": false, "ia": false, "chat.viewAll": false, "chat.assume": true, "chat.transfer": true, "chat.close": true, "chat.queues": false, "app.visaoGeral": false, "app.visaoGerente": false}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (name) DO NOTHING;

-- Visão do app por cargo: Gerente abre em Minha loja; Diretor no painel geral.
UPDATE "Role" SET permissions = permissions || '{"app.visaoGerente": true}'::jsonb WHERE name = 'Gerente' AND NOT permissions ? 'app.visaoGerente';
UPDATE "Role" SET permissions = permissions || '{"app.visaoGeral": true}'::jsonb WHERE name = 'Diretor' AND NOT permissions ? 'app.visaoGeral';
