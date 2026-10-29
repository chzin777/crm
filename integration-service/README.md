# Óticas Integration Service

Microsserviço read-only que expõe os dados do banco do e-commerce (VMSet / `oticas-site-postgres`) via API REST para consumo pelo **CRM** e pelo próprio **E-commerce**.

## Endpoints

Todos exigem o header `x-api-key: <API_KEY>`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Healthcheck (sem auth) |
| GET | `/v1/customers?limit=&offset=&search=` | Lista de clientes |
| GET | `/v1/customers/:id` | Cliente por ID |
| GET | `/v1/orders?limit=&offset=&customer_id=&status=&since=` | Pedidos |
| GET | `/v1/orders/:id` | Pedido + itens |
| GET | `/v1/carts/:customer_id` | Carrinho do cliente |
| GET | `/v1/store/settings` | Configurações da loja |
| GET | `/v1/store/state` | Estado da loja |
| GET | `/v1/stats` | Resumo para dashboards |

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

- `VMSET_DB_HOST` / `VMSET_DB_PORT` / `VMSET_DB_NAME` / `VMSET_DB_USER` / `VMSET_DB_PASSWORD` — conexão com o Postgres do e-commerce.
- `REDIS_URL` — Redis para cache (opcional; se ausente, caching é desabilitado).
- `CACHE_TTL_SECONDS` — TTL padrão do cache (default 60s).
- `API_KEY` — chave compartilhada com CRM/E-commerce (mínimo 8 chars).
- `PORT` — porta HTTP (default 4000).

## Rodando

### Desenvolvimento
```bash
npm install
cp .env.example .env
npm run dev
```

### Produção (Docker)
```bash
cp .env.example .env
# edite .env com a senha real do banco e uma API_KEY forte
docker compose up -d --build
```

A API ficará disponível em `http://172.30.20.15:4000`.

## Consumo pelo CRM / E-commerce

```ts
const res = await fetch("http://172.30.20.15:4000/v1/customers?limit=50", {
  headers: { "x-api-key": process.env.INTEGRATION_API_KEY! },
});
const { data } = await res.json();
```

## Arquitetura

```
oticas-site-postgres (VMSet)
        ↑ pg (pool)
[integration-api :4000]  ←── x-api-key
        ↓ HTTP
   ┌────┴────┐
  CRM     E-commerce
```

Cache em Redis (db 1) com TTL configurável para não sobrecarregar o banco do e-commerce.