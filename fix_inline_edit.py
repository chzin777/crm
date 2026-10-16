import sys
path = '/opt/crm/crm/app/page.tsx'
content = open(path).read()

# Add editingField state after isSavingCard state
state_anchor = "const [isSavingCard, setIsSavingCard] = useState(false);"
state_insert = """const [isSavingCard, setIsSavingCard] = useState(false);
const [editingField, setEditingField] = useState<string | null>(null);"""
if state_anchor not in content:
    print('STATE_ANCHOR_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(state_anchor, state_insert, 1)

# Replace Telefone field
old_telefone = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Telefone:', cardDraft.telefone); if (v !== null) setCardDraft(d => ({...d, telefone: v})); }}>
                    <Phone className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Telefone</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{formatPhone(cardDraft.telefone) || '\\u2014'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
new_telefone = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => setEditingField('telefone')}>
                    <Phone className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Telefone</dt>{editingField === 'telefone' ? <input autoFocus type="text" defaultValue={cardDraft.telefone} onBlur={(e) => { setCardDraft(d => ({...d, telefone: e.target.value})); setEditingField(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setCardDraft(d => ({...d, telefone: e.currentTarget.value})); setEditingField(null); } }} className="w-full rounded border border-[#002187] bg-white px-1 py-0.5 text-sm outline-none dark:border-[#C4D600] dark:bg-slate-800 dark:text-white" /> : <dd className="truncate font-medium text-slate-900 dark:text-white">{formatPhone(cardDraft.telefone) || '\\u2014'}</dd>}</div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
if old_telefone not in content:
    print('TELEFONE_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(old_telefone, new_telefone, 1)

# Replace Email field
old_email = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('E-mail:', cardDraft.email); if (v !== null) setCardDraft(d => ({...d, email: v})); }}>
                    <Mail className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">E-mail</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{cardDraft.email || '\\u2014'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
new_email = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => setEditingField('email')}>
                    <Mail className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">E-mail</dt>{editingField === 'email' ? <input autoFocus type="email" defaultValue={cardDraft.email} onBlur={(e) => { setCardDraft(d => ({...d, email: e.target.value})); setEditingField(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setCardDraft(d => ({...d, email: e.currentTarget.value})); setEditingField(null); } }} className="w-full rounded border border-[#002187] bg-white px-1 py-0.5 text-sm outline-none dark:border-[#C4D600] dark:bg-slate-800 dark:text-white" /> : <dd className="truncate font-medium text-slate-900 dark:text-white">{cardDraft.email || '\\u2014'}</dd>}</div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
if old_email not in content:
    print('EMAIL_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(old_email, new_email, 1)

# Replace Data Nascimento field
old_nasc = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Data de nascimento (DD/MM/AAAA):', cardDraft.dataNascimento); if (v !== null) setCardDraft(d => ({...d, dataNascimento: v})); }}>
                    <CalendarDays className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Data de nascimento</dt><dd className="font-medium text-slate-900 dark:text-white">{cardDraft.dataNascimento || '\\u2014'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
new_nasc = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => setEditingField('dataNascimento')}>
                    <CalendarDays className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Data de nascimento</dt>{editingField === 'dataNascimento' ? <input autoFocus type="text" defaultValue={cardDraft.dataNascimento} placeholder="DD/MM/AAAA" onBlur={(e) => { setCardDraft(d => ({...d, dataNascimento: e.target.value})); setEditingField(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setCardDraft(d => ({...d, dataNascimento: e.currentTarget.value})); setEditingField(null); } }} className="w-full rounded border border-[#002187] bg-white px-1 py-0.5 text-sm outline-none dark:border-[#C4D600] dark:bg-slate-800 dark:text-white" /> : <dd className="font-medium text-slate-900 dark:text-white">{cardDraft.dataNascimento || '\\u2014'}</dd>}</div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
if old_nasc not in content:
    print('NASC_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(old_nasc, new_nasc, 1)

# Replace Titulo Deal field
old_titulo = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('T\\u00edtulo do deal:', cardDraft.titulo); if (v !== null) setCardDraft(d => ({...d, titulo: v})); }}>
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Deal</dt><dd className="truncate font-semibold text-slate-900 dark:text-white">{cardDraft.titulo || '\\u2014'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
new_titulo = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => setEditingField('titulo')}>
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Deal</dt>{editingField === 'titulo' ? <input autoFocus type="text" defaultValue={cardDraft.titulo} onBlur={(e) => { setCardDraft(d => ({...d, titulo: e.target.value})); setEditingField(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setCardDraft(d => ({...d, titulo: e.currentTarget.value})); setEditingField(null); } }} className="w-full rounded border border-[#002187] bg-white px-1 py-0.5 text-sm outline-none dark:border-[#C4D600] dark:bg-slate-800 dark:text-white" /> : <dd className="truncate font-semibold text-slate-900 dark:text-white">{cardDraft.titulo || '\\u2014'}</dd>}</div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
if old_titulo not in content:
    print('TITULO_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(old_titulo, new_titulo, 1)

# Replace Valor field
old_valor = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Valor:', cardDraft.valor); if (v !== null) setCardDraft(d => ({...d, valor: v})); }}>
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Valor</dt><dd className="font-bold text-slate-900 dark:text-white">{cardDraft.valor || '\\u2014'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
new_valor = """<div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => setEditingField('valor')}>
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Valor</dt>{editingField === 'valor' ? <input autoFocus type="text" defaultValue={cardDraft.valor} onBlur={(e) => { setCardDraft(d => ({...d, valor: e.target.value})); setEditingField(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setCardDraft(d => ({...d, valor: e.currentTarget.value})); setEditingField(null); } }} className="w-full rounded border border-[#002187] bg-white px-1 py-0.5 text-sm outline-none dark:border-[#C4D600] dark:bg-slate-800 dark:text-white" /> : <dd className="font-bold text-slate-900 dark:text-white">{cardDraft.valor || '\\u2014'}</dd>}</div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>"""
if old_valor not in content:
    print('VALOR_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(old_valor, new_valor, 1)

open(path, 'w').write(content)
print('OK')