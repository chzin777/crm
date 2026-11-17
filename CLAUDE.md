# Regras Obrigatórias do Projeto CRM Óticas Brasil

## 🚫 PROTEÇÃO ABSOLUTA DE DADOS (REGRA INEGOCIÁVEL)

**NUNCA execute comandos que apaguem, recriem ou destruam dados sem autorização EXPLÍCITA do usuário.**

### Comandos PROIBIDOS sem confirmação expressa:
- `prisma db push --accept-data-loss`
- `prisma migrate reset`
- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`
- `DELETE FROM` sem WHERE específico e confirmado
- `rm -rf` em diretórios de dados
- Qualquer comando Docker que remova volumes (`docker compose down -v`)
- Recriação de schema que resulte em perda de dados

### Antes de qualquer operação destrutiva:
1. **PARE** e pergunte ao usuário: "Esta operação vai apagar dados. Você autoriza?"
2. **SEMPRE** faça backup antes (`pg_dump`, cópia de arquivos)
3. **NUNCA** assuma que "não tem dados importantes" — sempre confirme
4. Se o banco estiver vazio após uma operação, **IMEDIATAMENTE** informe o usuário e proponha restauração

### Regra de ouro:
> Dados só são apagados se o usuário mandar explicitamente. Sem exceções.

### Mudanças de banco
- Não há `prisma/migrations`: cada mudança é um SQL **aditivo e idempotente** em `prisma/*.sql`
  (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`), aplicado no servidor **antes** do push:
  `docker exec -i crm-postgres psql -U crm_user -d crm -v ON_ERROR_STOP=1 < prisma/<arquivo>.sql`
- O `schema.prisma` acompanha o SQL no mesmo commit.

---

## 🚀 PUBLICAÇÃO: BUILD, TESTES E DEPLOY ZERO-DOWNTIME

**Nunca** rode `npm run build` na pasta ativa de produção, nunca reinicie o app derrubando conexões e nunca use
`docker compose down` / `docker compose up --build` (não existe mais o serviço `crm-app`).

### Fluxo obrigatório (toda alteração, sem exceção)
1. `npm run test:run`
2. `npx tsc --noEmit` (e `npm run build` local quando mexer em rotas, config ou dependências)
3. `git add` → `git commit -m "vX.Y.Z: <tipo>(<escopo>): <descrição>"` → `git push origin main`
4. Deploy atômico `scripts/deploy-zero-downtime.sh`: disparado sozinho pelo webhook do push
   (`deploy/auto-deploy.sh`). Confirme `OK: vX.Y.Z (<sha>) no ar` em `/var/log/crm-deploy.log`.
   Fallback manual: `cd /opt/crm && git pull origin main && bash scripts/deploy-zero-downtime.sh`

### Como o deploy funciona (blue/green)
- Cloudflare Tunnel → `:3000` `crm-proxy` (nginx) → `crm-app-blue` (`:3001`) ou `crm-app-green` (`:3002`).
- Build isolado (`docker build` → imagem `crm-app:<sha>`) enquanto a cor ativa atende; a cor nova só recebe
  tráfego depois de responder `/api/health` com o commit novo. Se a porta 3000 não confirmar em 15 s, o proxy
  volta sozinho para a cor anterior. Ficam as 3 últimas releases.
- **Rollback imediato:** `bash /opt/crm/scripts/rollback.sh` (anterior), `rollback.sh --list`, `rollback.sh <sha>`.
  A release fica fixada até o próximo push na `main`.
- Estado em `/opt/crm/runtime/` (cor ativa em `active-color`). Logs do app:
  `docker logs crm-app-$(cat /opt/crm/runtime/active-color)`.
- Disparos de campanha/lote gravados há menos de 3 min não são retomados por outra instância (evita envio duplicado
  durante a troca de cor). Não remova essa trava.

---

## 🧭 ARQUITETURA FUNCIONAL (não quebrar)

- O repositório **é** a aplicação Next.js (raiz = `app/`, `components/`, `lib/`). No servidor fica em `/opt/crm`.
  Edite sempre localmente e publique pelo fluxo acima.

### Pipeline de Vendas automático e recorrência (`lib/sales-pipeline*.ts`)
- Oportunidades nascem de gatilhos comerciais reais (`SalesTrigger`: interesse em produto, receita enviada,
  orçamento de lentes, transbordo, visita à loja, venda faturada/manual).
- Cliente classificado como `novo` ou `recorrente` cruzando o histórico de compras do VMSet.
- **Regra de ouro:** evento automático só avança o card (`stageRank`), nunca o faz voltar; etapa movida à mão
  pelo vendedor é respeitada.

### Receituário estruturado (`CustomerPrescription`, `lib/prescriptions*.ts`)
- A IA extrai os graus da foto/PDF da receita, mantém o vínculo com o anexo original e marca
  `conferidoPorHumano`; a conferência é feita na aba Receituário do `/chat` e de `/contatos`.

### Financeiro / Crediário (human-in-the-loop, `AiPendingAction`)
- Parcelas/valores só depois de nome completo + CPF válido (dígito verificador).
- A IA nunca envia o financeiro direto: gera o card de aprovação no `/chat` (`requireApprovalForFinancialQueries`,
  ligado por padrão) e o operador confirma, corrige o CPF ou assume.

### Catálogo, visão computacional e Copiloto VMSet (`lib/ai/`)
- Resolvedor unificado de foto + estoque; marcas normalizadas por similaridade (`brand-resolve.ts`:
  "miumiu" → Miu Miu, "rayban" → Ray-Ban).
- Estoque filtrado pela cidade do cliente (`preferredCity`).
- Postura proativa: a IA busca e mostra opções sem pedir permissão.
- Copiloto VMSet é uma sidebar flutuante sobre o `/chat` (overlay `backdrop-blur-sm`), não uma coluna fixa.

### LGPD, segurança e operação
- **Opt-out:** `SAIR`/`PARAR`/`DESCADASTRAR`/`NAO QUERO MAIS`/`CANCELAR RECEBIMENTO` → `Contact.marketingOptOut = true`
  (`REATIVAR`/`VOLTAR` desfaz). Todo envio de campanha ou lote **deve** excluir `marketingOptOut = true`
  (`lib/marketing-opt-out*.ts`). Selo "Opt-out / Não perturbe" em `/contatos` e no `/chat`.
- **Login:** 5 falhas seguidas por IP + e-mail → 15 min de bloqueio (HTTP 429), em `app/api/auth/[...all]/route.ts`.
- **Erros críticos:** use `reportError(origem, erro, contexto)` de `lib/monitoring/error-reporter.ts`
  (grava `SystemErrorLog`, avisa `ALERT_WEBHOOK_URL`, cooldown de 10 min). Nunca deixe falha de webhook,
  IA, campanha ou rotina só no `console.error`.
- **Saúde:** `/api/health` público (versão/commit, usado pelo deploy); `?details=1` com sessão ou
  `Authorization: Bearer $HEALTH_TOKEN` mostra banco, sync do VMSet, último backup e erros em 24h.
- **Backup:** `scripts/backup-db.sh` diário às 03:00 (systemd `crm-db-backup.timer`; o servidor não tem cron),
  em `/var/backups/crm-db`, 14 dias + último de cada mês, log em `/var/log/crm-db-backup.log`.

---

## 🎨 IDENTIDADE VISUAL E UI

Paleta oficial obrigatória:
- Azul Profundo: `#051647`
- Verde Elétrico: `#C4D600`
- Azul Médio: `#002187`
- Laranja (destaque): `#F7915E`

Tipografia: Graphik (Semibold títulos, Medium destaque, Regular corpo, Light leve)

### Padrões rígidos
- Todos os botões clicáveis devem ter `cursor-pointer`.
- **Zero emojis soltos na interface:** badges, abas, botões e cabeçalhos usam ícones vetoriais `lucide-react`.
  (Emojis só em textos enviados ao cliente pelo WhatsApp.)
- **Kanban do Pipeline:** sempre em linha única horizontal (`flex-nowrap overflow-x-auto`); colunas nunca quebram
  para baixo.
- **Contenção de texto:** `min-w-0` e `break-words` em cards, listas e sidebars; nada de overflow horizontal.
- Modais e diálogos usam `<EntityDialog />` (portal em `document.body`), nunca `fixed inset-0` manual.
