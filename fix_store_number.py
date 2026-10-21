import re, sys

path = '/opt/crm/crm'

# ============================================================
# 1. SCHEMA: remover campo number, tornar name @unique
# ============================================================
schema_path = f'{path}/prisma/schema.prisma'
schema = open(schema_path, encoding='utf-8').read()

old_store_model = '''model Store {
  id            String   @id @default(cuid())
  number        Int      @unique
  name          String'''

new_store_model = '''model Store {
  id            String   @id @default(cuid())
  name          String   @unique'''

if old_store_model not in schema:
    print('STORE_MODEL_NOT_FOUND', file=sys.stderr); sys.exit(1)
schema = schema.replace(old_store_model, new_store_model, 1)
open(schema_path, 'w', encoding='utf-8').write(schema)
print('1. Schema updated')

# ============================================================
# 2. STORES API (route.ts): remover number do zod, serialize, toData, queries
# ============================================================
api_path = f'{path}/app/api/stores/route.ts'
api = open(api_path, encoding='utf-8').read()

# Remover number do zod schema
api = api.replace('  number: z.number().int().min(1).max(99999),\n', '', 1)

# Remover number do serialize
api = api.replace('    number: store.number,\n', '', 1)

# Remover number do toData
api = api.replace('    number: input.number,\n', '', 1)

# Atualizar findUnique where clauses: number -> name
api = api.replace('{ where: { number: parsed.data.number } }', '{ where: { name: parsed.data.name } }')

# Atualizar mensagens de erro
api = api.replace('Já existe a loja ${parsed.data.number}.', 'Já existe a loja "${parsed.data.name}".')

# Atualizar sort fields: trocar "number" por "name" como default
api = api.replace('"sortBy") || "number"', '"sortBy") || "name"')
api = api.replace('loja: "number",', 'loja: "name",')
api = api.replace('numero: "number",', '')
api = api.replace('number: "number",', 'number: "name",')
api = api.replace('["number", "name", "city", "active"]', '["name", "city", "active"]')
api = api.replace('? sortField : "number"', '? sortField : "name"')

# Atualizar serialize function signature: remover number param
api = re.sub(
    r'function serialize\(store: \{[^}]*number: number; ',
    'function serialize(store: { ',
    api
)

open(api_path, 'w', encoding='utf-8').write(api)
print('2. Stores API updated')

# ============================================================
# 3. STORES SYNC API: remover number
# ============================================================
sync_path = f'{path}/app/api/stores/sync/route.ts'
sync = open(sync_path, encoding='utf-8').read()

sync = sync.replace('    const { number, name,', '    const { name,')
sync = sync.replace('    if (typeof number !== "number" || !name) {\n      return NextResponse.json({ error: "number and name are required" }, { status: 400 });\n    }',
                     '    if (!name) {\n      return NextResponse.json({ error: "name is required" }, { status: 400 });\n    }')
sync = sync.replace('      where: { number },', '      where: { name },')
# Remover number dos blocos update e create
sync = re.sub(r'(update: \{)\n\s+number,\n', r'\1\n', sync)
sync = re.sub(r'(create: \{)\n\s+number,\n', r'\1\n', sync)

open(sync_path, 'w', encoding='utf-8').write(sync)
print('3. Stores sync API updated')

# ============================================================
# 4. SEGMENTS AUDIENCE API: trocar store.number por store.id/name
# ============================================================
aud_path = f'{path}/app/api/segments/audience/route.ts'
aud = open(aud_path, encoding='utf-8').read()

# Tipo StoreRecord: remover number, adicionar id e name
aud = aud.replace(
    'type StoreRecord = { number: number; neighborhoods: string[]; city: string | null; radiusKm: number; lat: number | null; lng: number | null };',
    'type StoreRecord = { id: string; name: string; neighborhoods: string[]; city: string | null; radiusKm: number; lat: number | null; lng: number | null };'
)

# Queries SQL: trocar store.number por store.id ou store.name
aud = aud.replace('o.number <> ${store.number}', 'o.id <> ${store.id}')
aud = aud.replace('o.number < ${store.number}', 'o.name < ${store.name}')
aud = aud.replace("btrim(c.store) = ${String(store.number)}", "btrim(c.store) = ${store.name}")

# Map construction: trocar chave de number para name
aud = aud.replace(
    'const stores = new Map((await prisma.store.findMany()).map((store) => [store.number, store]));',
    'const stores = new Map((await prisma.store.findMany()).map((store) => [store.name, store]));'
)

open(aud_path, 'w', encoding='utf-8').write(aud)
print('4. Segments audience API updated')

# ============================================================
# 5. LOJAS PAGE: remover referências a store.number
# ============================================================
lojas_path = f'{path}/app/lojas/page.tsx'
lojas = open(lojas_path, encoding='utf-8').read()

# Linha 92: groups usando store.name em vez de store.number
lojas = lojas.replace(
    '[String(store.number), [{ id: `store-${store.number}`, nome: `Loja ${store.number}`, tipo: "loja" }]]',
    '[store.name, [{ id: store.id, nome: store.name, tipo: "loja" }]]'
)

# Linha 171: novo store sem number
lojas = lojas.replace(
    'number: String(Math.max(0, ...stores.map((item) => item.number)) + 1),',
    ''
)

# Linha 173: editar store sem number
lojas = lojas.replace('number: String(store.number),', '')

# Linha 195: converter form.number
lojas = lojas.replace('const number = Number(form.number);', '')

# Linha 222: sort por name em vez de number
lojas = lojas.replace('.sort((a, b) => a.number - b.number)', '.sort((a, b) => a.name.localeCompare(b.name))')

# Linha 256: confirm message
lojas = lojas.replace('Remover a loja ${store.number} - ${store.name}?', 'Remover a loja ${store.name}?')

# Linha 270: search filter - remover store.number
lojas = lojas.replace(
    '`${store.number} ${store.name} ${store.address} ${store.city} ${store.neighborhoods.join(" ")}`',
    '`${store.name} ${store.address} ${store.city} ${store.neighborhoods.join(" ")}`'
)

# Linha 277: outro form.number
lojas = lojas.replace('const number = Number(form.number);', '', 1)

# Linha 292: input number field - remover
lojas = re.sub(
    r'<input type="number" min=\{1\} value=\{form\.number\} onChange=\{\(event\) => updateStoreNumber\(event\.target\.value\)\} className=\{`\$\{inputClass\} mt-1`\} />\s*',
    '',
    lojas
)

# Linha 455: aria-label
lojas = lojas.replace('Abrir detalhes da loja ${store.number}', 'Abrir detalhes da loja ${store.name}')

# Linha 470: display name
lojas = lojas.replace(
    'Loja {store.number}{store.name !== `Loja ${store.number}` ? ` · ${store.name}` : ""}',
    '{store.name}'
)

# Linhas 482-484: counts lookup
lojas = lojas.replace('counts[String(store.number)]', 'counts[store.name]')

# Linha 514: dialog title
lojas = lojas.replace('Editar loja ${editing.number}', 'Editar loja ${editing.name}')

# Linha 574: detail view
lojas = lojas.replace(
    'Loja {form.number} · {form.name || "Sem nome"}{form.active ? "" : " (inativa)"}',
    '{form.name || "Sem nome"}{form.active ? "" : " (inativa)"}'
)

# Sort config default
lojas = lojas.replace('field: "number"', 'field: "name"')

open(lojas_path, 'w', encoding='utf-8').write(lojas)
print('5. Lojas page updated')

# ============================================================
# 6. CAMPANHAS PAGE: remover store.number references
# ============================================================
camp_path = f'{path}/app/campanhas/page.tsx'
camp = open(camp_path, encoding='utf-8').read()

# Tipo stores state
camp = camp.replace(
    'const [stores, setStores] = useState<{ number: number; active: boolean }[]>([]);',
    'const [stores, setStores] = useState<{ id: string; name: string; active: boolean }[]>([]);'
)

# Sort e map
camp = camp.replace(
    "...[...stores].sort((a, b) => a.number - b.number).map((store) => ({\n      id: `store-${store.number}`,\n      nome: `Loja ${store.number}`,",
    "...[...stores].sort((a, b) => a.name.localeCompare(b.name)).map((store) => ({\n      id: store.id,\n      nome: store.name,"
)

open(camp_path, 'w', encoding='utf-8').write(camp)
print('6. Campanhas page updated')

# ============================================================
# 7. DB MIGRATION: atualizar Contact.store e ImportedSale data->LOJA
#    para usar nome real da loja em vez do número sequencial
# ============================================================
# Isso será feito via SQL separado após o deploy do schema

print('OK')