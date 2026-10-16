import re, sys
path = '/opt/crm/crm/app/page.tsx'
content = open(path, encoding='utf-8').read()

# 1. Add editingField state if not present
if 'const [editingField, setEditingField]' not in content:
    anchor = "const [isSavingCard, setIsSavingCard] = useState(false);"
    if anchor not in content:
        print('STATE_ANCHOR_NOT_FOUND', file=sys.stderr); sys.exit(1)
    content = content.replace(anchor, anchor + "\nconst [editingField, setEditingField] = useState<string | null>(null);", 1)

DASH = '—'

def make_field(field_name, label_text, icon_jsx, dd_class, input_type='text', placeholder='', display_expr=None):
    if display_expr is None:
        display_expr = f"cardDraft.{field_name}"
    ph = f' placeholder="{placeholder}"' if placeholder else ''
    return (
        f'<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={{() => setEditingField(\'{field_name}\')}}>\n'
        f'{icon_jsx}\n'
        f'<div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">{label_text}</dt>'
        f'{{editingField === \'{field_name}\' ? '
        f'<input autoFocus type="{input_type}" defaultValue={{cardDraft.{field_name}}} '
        f'onBlur={{(e) => {{ setCardDraft(d => ({{...d, {field_name}: e.target.value}})); setEditingField(null); }}}} '
        f'onKeyDown={{(e) => {{ if (e.key === \'Enter\') {{ setCardDraft(d => ({{...d, {field_name}: e.currentTarget.value}})); setEditingField(null); }} }}}} '
        f'className="w-full rounded border border-[#002187] bg-white px-1 py-0.5 text-sm outline-none dark:border-[#C4D600] dark:bg-slate-800 dark:text-white"{ph} /> '
        f': <dd className="{dd_class}">{{{display_expr} || \'{DASH}\'}}</dd>}}'
        f'</div>\n'
        f'<Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />\n'
        f'</div>'
    )

phone_icon = '<Phone className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />'
mail_icon = '<Mail className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />'
cal_icon = '<CalendarDays className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />'

replacements = [
    (
        r"<div className=\"group flex items-center gap-3 rounded-lg px-2 py-1\.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer\" onClick=\{\(\) => \{ const v = prompt\('Telefone:', cardDraft\.telefone\); if \(v !== null\) setCardDraft\(d => \(\{\.\.\.d, telefone: v\}\)\); \}\}>.*?<Pencil className=\"h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600\" />\s*</div>",
        lambda m: make_field('telefone', 'Telefone', phone_icon, 'truncate font-medium text-slate-900 dark:text-white', display_expr='formatPhone(cardDraft.telefone)'),
        'TELEFONE',
    ),
    (
        r"<div className=\"group flex items-center gap-3 rounded-lg px-2 py-1\.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer\" onClick=\{\(\) => \{ const v = prompt\('E-mail:', cardDraft\.email\); if \(v !== null\) setCardDraft\(d => \(\{\.\.\.d, email: v\}\)\); \}\}>.*?<Pencil className=\"h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600\" />\s*</div>",
        lambda m: make_field('email', 'E-mail', mail_icon, 'truncate font-medium text-slate-900 dark:text-white'),
        'EMAIL',
    ),
    (
        r"<div className=\"group flex items-center gap-3 rounded-lg px-2 py-1\.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer\" onClick=\{\(\) => \{ const v = prompt\('Data de nascimento[^']*', cardDraft\.dataNascimento\); if \(v !== null\) setCardDraft\(d => \(\{\.\.\.d, dataNascimento: v\}\)\); \}\}>.*?<Pencil className=\"h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600\" />\s*</div>",
        lambda m: make_field('dataNascimento', 'Data de nascimento', cal_icon, 'font-medium text-slate-900 dark:text-white', placeholder='DD/MM/AAAA'),
        'NASC',
    ),
    (
        r"<div className=\"group flex items-center gap-3 rounded-lg px-2 py-1\.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer\" onClick=\{\(\) => \{ const v = prompt\('[^']*tulo do deal:', cardDraft\.titulo\); if \(v !== null\) setCardDraft\(d => \(\{\.\.\.d, titulo: v\}\)\); \}\}>.*?<Pencil className=\"h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600\" />\s*</div>",
        lambda m: make_field('titulo', 'Deal', '', 'truncate font-semibold text-slate-900 dark:text-white'),
        'TITULO',
    ),
    (
        r"<div className=\"group flex items-center gap-3 rounded-lg px-2 py-1\.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer\" onClick=\{\(\) => \{ const v = prompt\('Valor:', cardDraft\.valor\); if \(v !== null\) setCardDraft\(d => \(\{\.\.\.d, valor: v\}\)\); \}\}>.*?<Pencil className=\"h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600\" />\s*</div>",
        lambda m: make_field('valor', 'Valor', '', 'font-bold text-slate-900 dark:text-white'),
        'VALOR',
    ),
]

for pattern, repl_fn, name in replacements:
    content_new = re.sub(pattern, repl_fn, content, count=1, flags=re.DOTALL)
    if content_new == content:
        print(f'{name}_NOT_FOUND', file=sys.stderr)
        sys.exit(1)
    content = content_new

# 3. Add 'mensagens' tab to the tab bar
old_tabs = "{k:'compras',l:'Compras'}"
new_tabs = "{k:'compras',l:'Compras'},{k:'mensagens',l:'Mensagens'}"
if old_tabs not in content:
    print('TABS_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(old_tabs, new_tabs, 1)

# 4. Update detailTab type to include 'mensagens'
old_tab_type = "useState<'dados'|'negocio'|'compras'>('dados')"
new_tab_type = "useState<'dados'|'negocio'|'compras'|'mensagens'>('dados')"
if old_tab_type in content:
    content = content.replace(old_tab_type, new_tab_type, 1)

# 5. Add mensagens tab content after compras tab closing and update footer condition
# Exact marker from server: 14-space indent, closing </div> of scrollable area, then footer condition
compras_end_marker = """              )}
            </div>
            {detailTab !== 'compras' && ("""

mensagens_content = f"""              )}}
            </div>
            {{detailTab === 'mensagens' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">Histórico de mensagens WhatsApp será disponível após integração com Evolution API.</p>
              </div>
            )}}
            </div>
            {{detailTab !== 'compras' && detailTab !== 'mensagens' && ("""

if compras_end_marker not in content:
    print('COMPRAS_END_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(compras_end_marker, mensagens_content, 1)

open(path, 'w', encoding='utf-8').write(content)
print('OK')