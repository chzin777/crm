import re, sys
path = '/opt/crm/crm'

# ============================================================
# 1. LOJAS PAGE: remover number do emptyForm e do tipo StoreRecord
# ============================================================
lojas_path = f'{path}/app/lojas/page.tsx'
lojas = open(lojas_path, encoding='utf-8').read()

# Remover number do emptyForm
lojas = re.sub(r'\s+number: "",\n', '\n', lojas)

# Remover number do tipo StoreRecord se ainda existir
lojas = re.sub(r'\s+number: string;\n', '\n', lojas)
lojas = re.sub(r'\s+number: number;\n', '\n', lojas)

open(lojas_path, 'w', encoding='utf-8').write(lojas)
print('1. Lojas page fixed')

# ============================================================
# 2. SEGMENTS AUDIENCE API: corrigir stores.get(Number(...)) para usar name/id
# e corrigir orderBy/select com number
# ============================================================
aud_path = f'{path}/app/api/segments/audience/route.ts'
aud = open(aud_path, encoding='utf-8').read()

# Corrigir stores.get(Number(criterion.id.replace(/^store-/, "")))
# Agora o Map usa store.name como chave, então precisamos buscar por nome
# O criterion.id tem formato "store-NUMERO" antigo; vamos extrair o nome da loja
# Como não temos mais número, vamos buscar pelo nome diretamente
# Mudar: stores.get(Number(criterion.id.replace(/^store-/, "")))
# Para: stores.get(criterion.id.replace(/^store-/, ""))
aud = aud.replace(
    'stores.get(Number(criterion.id.replace(/^store-/, "")))',
    'stores.get(criterion.id.replace(/^store-/, ""))'
)

# Corrigir orderBy { number: "asc" } para { name: "asc" }
aud = aud.replace('orderBy: { number: "asc" }', 'orderBy: { name: "asc" }')
aud = aud.replace("orderBy: { number: 'asc' }", "orderBy: { name: 'asc' }")

# Corrigir select que pode incluir number
aud = re.sub(r'\s+number: true,', '', aud)

open(aud_path, 'w', encoding='utf-8').write(aud)
print('2. Segments audience API fixed')

# ============================================================
# 3. STORES API: garantir que serialize inclui id e remove number
# ============================================================
api_path = f'{path}/app/api/stores/route.ts'
api = open(api_path, encoding='utf-8').read()

# Remover qualquer referência residual a number no serialize/toData
api = re.sub(r'\s+number: store\.number,\n', '\n', api)
api = re.sub(r'\s+number: input\.number,\n', '\n', api)

open(api_path, 'w', encoding='utf-8').write(api)
print('3. Stores API fixed')

# ============================================================
# 4. CAMPANHAS PAGE: verificar e corrigir referências a store.number
# ============================================================
camp_path = f'{path}/app/campanhas/page.tsx'
camp = open(camp_path, encoding='utf-8').read()

# Garantir que não há referências a .number em stores
camp = re.sub(r'store\.number', 'store.name', camp)
camp = re.sub(r'a\.number - b\.number', 'a.name.localeCompare(b.name)', camp)

open(camp_path, 'w', encoding='utf-8').write(camp)
print('4. Campanhas page fixed')

print('OK')