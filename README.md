This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
## Banco de dados e importação de contatos

O projeto usa Prisma ORM 7 com PostgreSQL. Configure `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER` e `DB_PASSWORD` no `.env`; use o `.env.example` como referência. O arquivo
`.env` real não deve ser versionado.

O acesso ao CRM usa Better Auth, sessão persistida no PostgreSQL e login por e-mail e
senha. Não há cadastro público. Para configurar o primeiro administrador, preencha
`INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` no `.env`
(senha de pelo menos 12 caracteres), aplique o schema com `npm run db:sync` e rode
`npm run db:admin`. O bootstrap só cria a conta se ainda não houver usuários. Após o
primeiro login, remova `INITIAL_ADMIN_PASSWORD` do `.env`. A função `admin` concede
as permissões administrativas disponíveis no Better Auth.

A rota `/login` usa o símbolo oficial sem lettering e um layout dividido com painel
visual Grainient nas cores da marca. As rotas do CRM redirecionam para o login quando
não há cookie de sessão; APIs que retornarem dados devem validar a sessão e a
autorização no servidor, sem depender somente desse redirecionamento.

### Cache (Redis) e pool de conexões (PgBouncer)

O `docker-compose.yml` sobe Redis (`6379`) e PgBouncer (`6432`, modo `transaction`,
apontando para o PostgreSQL em `POSTGRESQL_HOST`/`POSTGRESQL_PORT`). Rode
`docker compose up -d` e use `DB_PORT=6432` e `REDIS_URL=redis://localhost:6379`.

- A aplicação conecta pelo PgBouncer (`DB_HOST`/`DB_PORT`, pool local `DB_POOL_MAX`).
- O Prisma CLI (`db:sync`) usa `DIRECT_DB_HOST`/`DIRECT_DB_PORT`, direto no PostgreSQL.
- Cache com TTL em `lib/cache.ts`: dashboard (60 s), lojas (5 min) e cidades/bairros (1 h),
  invalidado ao alterar contatos, NPS, pipeline e lojas. Sem `REDIS_URL`, ou se o Redis
  cair, as rotas consultam o banco normalmente.

Com as dependências instaladas, os comandos principais são:

```bash
npm run db:generate
npm run db:sync
npm run db:import -- "C:\path\to\contacts.csv"
```

`db:sync` aplica o schema Prisma ao PostgreSQL, incluindo as tabelas de autenticação,
`Contact`, `ImportedSale`, `NpsResponse` e `CrmWorkspaceData`. A importação lê o CSV
em streaming, cria um contato por CPF (com e-mail ou telefone como alternativas
quando o CPF não existe) e guarda cada linha original de venda/item em `ImportedSale`
como JSONB, associada ao contato. Isso preserva as 87 colunas sem manter uma cópia
duplicada dos dados de venda na tabela de contatos.

Contatos, usuários e respostas NPS são lidos e gravados nas tabelas correspondentes.
Dados compartilhados do workspace — segmentos, critérios, campanhas, pipeline,
preferências e modelos de mensagem NPS — são persistidos em `CrmWorkspaceData` como
JSONB. As gravações dessas coleções usam revisão otimista; uma alteração concorrente
de outra sessão é rejeitada com conflito para evitar sobrescrever dados mais recentes.
O painel e as atividades recentes são agregados a partir de contatos, vendas
importadas, pipeline e respostas NPS.

Limitações atuais: campanhas e configurações de WhatsApp são registradas no CRM, mas
não enviam mensagens nem coletam respostas sem integração com um provedor. O cadastro
de usuário não envia convite nem define uma senha; o administrador precisa configurar
o acesso por meio do fluxo de autenticação disponível. Anexos de campanha mantêm
metadados no registro, não o conteúdo dos arquivos.

Em uma instalação existente, revise e faça backup do banco antes de executar
`npm run db:sync`; esse comando altera o schema conforme o `schema.prisma` local.

O importador recusa uma segunda carga do mesmo caminho para evitar duplicatas. Use
`npm run db:import -- "C:\path\to\contacts.csv" --replace` somente quando quiser
substituir as linhas importadas daquele arquivo.

As credenciais são usadas somente no servidor. Não use variáveis `NEXT_PUBLIC_` para
segredos do banco. Antes de expor contatos pela interface ou por endpoints, configure
autenticação e autorização adequadas para proteger os dados pessoais importados.
