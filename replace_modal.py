import sys
content = open('/opt/crm/crm/app/page.tsx').read()
old_start = '      {selectedCard && (\n        <div\n          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#051647]/55 p-4 backdrop-blur-sm"'
old_end = '          </section>\n        </div>\n      )}\n    </div>'
start_idx = content.find(old_start)
if start_idx == -1:
    print('START_NOT_FOUND', file=sys.stderr); sys.exit(1)
end_idx = content.find(old_end, start_idx)
if end_idx == -1:
    print('END_NOT_FOUND', file=sys.stderr); sys.exit(1)
end_idx += len(old_end)
new_block = """      {selectedCard && (() => {
        const [tab, setTab] = useState<'dados'|'negocio'|'compras'>('dados');
        const [draft, setDraft] = useState({ telefone: selectedCard.telefone, email: selectedCard.email, dataNascimento: selectedCard.dataNascimento, titulo: selectedCard.titulo, valor: selectedCard.valor });
        const [saving, setSaving] = useState(false);
        const hasChanges = draft.telefone !== selectedCard.telefone || draft.email !== selectedCard.email || draft.dataNascimento !== selectedCard.dataNascimento || draft.titulo !== selectedCard.titulo || draft.valor !== selectedCard.valor;
        const handleSave = async () => { setSaving(true); try { setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, ...draft } : c)); setSelectedCard((prev) => prev ? { ...prev, ...draft } : null); } finally { setSaving(false); } };
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#051647]/55 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedCard(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="customer-details-title" className="flex h-[600px] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#07194f]">
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-700">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#051647] text-sm font-bold text-white dark:bg-[#C4D600] dark:text-[#051647]">{selectedCard.iniciais}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Detalhes do cliente</p>
                    <h2 id="customer-details-title" className="truncate text-lg font-bold text-slate-900 dark:text-white">{selectedCard.cliente}</h2>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedCard.tagColor}`}>{selectedCard.tag}</span>
                  </div>
                </div>
                <button ref={closeDialogButtonRef} type="button" onClick={() => setSelectedCard(null)} aria-label="Fechar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer hover:cursor-pointer"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex shrink-0 gap-1 border-b border-slate-200 px-6 dark:border-slate-700">
                {([{k:'dados',l:'Dados'},{k:'negocio',l:'Negócio'},{k:'compras',l:'Compras'}] as const).map((t) => (
                  <button key={t.k} type="button" onClick={() => setTab(t.k)} className={`relative px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${tab===t.k ? 'text-[#002187] dark:text-[#C4D600]' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                    {t.l}{tab===t.k && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C4D600]" />}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {tab === 'dados' && (
                  <dl className="space-y-4 text-sm">
                    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Telefone:', draft.telefone); if (v !== null) setDraft(d => ({...d, telefone: v})); }}>
                      <Phone className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                      <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Telefone</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{formatPhone(draft.telefone) || '—'}</dd></div>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                    </div>
                    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('E-mail:', draft.email); if (v !== null) setDraft(d => ({...d, email: v})); }}>
                      <Mail className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                      <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">E-mail</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{draft.email || '—'}</dd></div>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                    </div>
                    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Data de nascimento (DD/MM/AAAA):', draft.dataNascimento); if (v !== null) setDraft(d => ({...d, dataNascimento: v})); }}>
                      <CalendarDays className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                      <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Data de nascimento</dt><dd className="font-medium text-slate-900 dark:text-white">{draft.dataNascimento || '—'}</dd></div>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                    </div>
                  </dl>
                )}
                {tab === 'negocio' && (
                  <dl className="space-y-4 text-sm">
                    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Título do deal:', draft.titulo); if (v !== null) setDraft(d => ({...d, titulo: v})); }}>
                      <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Deal</dt><dd className="truncate font-semibold text-slate-900 dark:text-white">{draft.titulo || '—'}</dd></div>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                    </div>
                    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Valor:', draft.valor); if (v !== null) setDraft(d => ({...d, valor: v})); }}>
                      <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Valor</dt><dd className="font-bold text-slate-900 dark:text-white">{draft.valor || '—'}</dd></div>
                      <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                    </div>
                    <div className="flex items-center gap-3 px-2 py-1.5"><div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Etapa</dt><dd className="font-medium text-slate-900 dark:text-white">{stageTitle(selectedCard.coluna)}</dd></div></div>
                    <div className="flex items-center gap-3 px-2 py-1.5"><div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Dias na etapa</dt><dd className="font-medium text-slate-900 dark:text-white">{selectedCard.diasNaEtapa}</dd></div></div>
                  </dl>
                )}
                {tab === 'compras' && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(() => {
                      const purchases = selectedCard.ultimasCompras.length > 0 ? selectedCard.ultimasCompras : loadedPurchases && loadedPurchases.contactId === selectedCard.contactId ? loadedPurchases.items ?? [] : null;
                      if (purchases === null) return selectedCard.contactId ? <LoadingSpinner label="Carregando compras..." size={32} className="py-3" /> : <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Não há compras registradas.</p>;
                      if (purchases.length === 0) return <p className="py-3 text-xs text-slate-500 dark:text-slate-400">Não há compras registradas.</p>;
                      return purchases.map((p, i) => (
                        <div key={`${p.data}-${p.produto}-${i}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                          <div className="min-w-0"><p className="truncate font-semibold text-slate-800 dark:text-slate-100">{p.produto}</p><p className="text-xs text-slate-500 dark:text-slate-400">{p.data}</p></div>
                          <span className="shrink-0 font-bold text-slate-900 dark:text-white">{p.valor}</span>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
              {tab !== 'compras' && (
                <div className="flex shrink-0 items-center justify-end border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                  <button type="button" disabled={!hasChanges || saving} onClick={handleSave} className={`rounded-lg px-5 py-2 text-xs font-bold transition-colors cursor-pointer hover:cursor-pointer ${hasChanges ? 'bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D]' : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'}`}>
                    {saving ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              )}
            </section>
          </div>
        );
      })()}
    </div>"""
result = content[:start_idx] + new_block + content[end_idx:]
open('/opt/crm/crm/app/page.tsx', 'w').write(result)
print('OK')