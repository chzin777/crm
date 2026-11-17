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

---

## ⚠️ REBUILD OBRIGATÓRIO APÓS QUALQUER ALTERAÇÃO

Toda alteração vai ao ar pelo deploy sem queda (blue/green). O push na `main` dispara o webhook, que roda
`deploy/auto-deploy.sh` → `scripts/deploy-zero-downtime.sh`. Manualmente (fallback):
```bash
cd /opt/crm && git pull origin main && bash scripts/deploy-zero-downtime.sh
```
- Arquitetura: Cloudflare Tunnel → `:3000` `crm-proxy` (nginx) → `crm-app-blue` (`:3001`) ou `crm-app-green` (`:3002`).
- Rollback rápido: `bash /opt/crm/scripts/rollback.sh` (release anterior) ou `rollback.sh --list` / `rollback.sh <sha>`.
- Log: `/var/log/crm-deploy.log`. Cor ativa: `/opt/crm/runtime/active-color`.
- **Nunca** usar `docker compose down` nem `docker compose up --build` para o app: não existe mais o serviço `crm-app`.

---

## 📖 LEITURA DE CÓDIGO

Sempre ler arquivos do servidor (`/opt/crm/crm/`) via SSH, não os locais.
Chave SSH: `/c/Users/ti/.ssh/id_ed25519_vmset`
Servidor: `root@172.30.20.15`

---

## 🎨 IDENTIDADE VISUAL

Paleta oficial obrigatória:
- Azul Profundo: `#051647`
- Verde Elétrico: `#C4D600`
- Azul Médio: `#002187`
- Laranja (destaque): `#F7915E`

Tipografia: Graphik (Semibold títulos, Medium destaque, Regular corpo, Light leve)

Todos os botões clicáveis devem ter `cursor-pointer`.