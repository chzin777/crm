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

Toda alteração exige rebuild imediato no servidor:
```bash
cd /opt/crm && docker compose down && docker compose up --build -d
```

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