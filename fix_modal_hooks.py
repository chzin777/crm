import sys

path = '/opt/crm/crm/app/page.tsx'
content = open(path).read()

# 1. Add modal state variables after editingStageId (line 200)
state_anchor = 'const [editingStageId, setEditingStageId] = useState<StageId | null>(null);'
state_insert = """const [editingStageId, setEditingStageId] = useState<StageId | null>(null);
  const [detailTab, setDetailTab] = useState<'dados'|'negocio'|'compras'>('dados');
  const [cardDraft, setCardDraft] = useState({ telefone: '', email: '', dataNascimento: '', titulo: '', valor: '' });
  const [isSavingCard, setIsSavingCard] = useState(false);"""

if state_anchor not in content:
    print('STATE_ANCHOR_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(state_anchor, state_insert, 1)

# 2. Replace the IIFE modal block with direct JSX using component-level state
old_modal_start = '{selectedCard && (() => {'
old_modal_end_marker = "})()}\n    </div>"

start_idx = content.find(old_modal_start)
if start_idx == -1:
    print('MODAL_START_NOT_FOUND', file=sys.stderr); sys.exit(1)
end_idx = content.find(old_modal_end_marker, start_idx)
if end_idx == -1:
    print('MODAL_END_NOT_FOUND', file=sys.stderr); sys.exit(1)
end_idx += len(old_modal_end_marker)

new_modal = """{selectedCard && (
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
                <button key={t.k} type="button" onClick={() => setDetailTab(t.k)} className={`relative px-4 py-2.5 text-xs font-semibold transition-colors cursor-pointer hover:cursor-pointer ${detailTab===t.k ? 'text-[#002187] dark:text-[#C4D600]' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                  {t.l}{detailTab===t.k && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C4D600]" />}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {detailTab === 'dados' && (
                <dl className="space-y-4 text-sm">
                  <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Telefone:', cardDraft.telefone); if (v !== null) setCardDraft(d => ({...d, telefone: v})); }}>
                    <Phone className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Telefone</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{formatPhone(cardDraft.telefone) || '—'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>
                  <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('E-mail:', cardDraft.email); if (v !== null) setCardDraft(d => ({...d, email: v})); }}>
                    <Mail className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">E-mail</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{cardDraft.email || '—'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>
                  <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Data de nascimento (DD/MM/AAAA):', cardDraft.dataNascimento); if (v !== null) setCardDraft(d => ({...d, dataNascimento: v})); }}>
                    <CalendarDays className="h-4 w-4 shrink-0 text-[#002187] dark:text-[#C4D600]" />
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Data de nascimento</dt><dd className="font-medium text-slate-900 dark:text-white">{cardDraft.dataNascimento || '—'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>
                </dl>
              )}
              {detailTab === 'negocio' && (
                <dl className="space-y-4 text-sm">
                  <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Título do deal:', cardDraft.titulo); if (v !== null) setCardDraft(d => ({...d, titulo: v})); }}>
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Deal</dt><dd className="truncate font-semibold text-slate-900 dark:text-white">{cardDraft.titulo || '—'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>
                  <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer hover:cursor-pointer" onClick={() => { const v = prompt('Valor:', cardDraft.valor); if (v !== null) setCardDraft(d => ({...d, valor: v})); }}>
                    <div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Valor</dt><dd className="font-bold text-slate-900 dark:text-white">{cardDraft.valor || '—'}</dd></div>
                    <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" />
                  </div>
                  <div className="flex items-center gap-3 px-2 py-1.5"><div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Etapa</dt><dd className="font-medium text-slate-900 dark:text-white">{stageTitle(selectedCard.coluna)}</dd></div></div>
                  <div className="flex items-center gap-3 px-2 py-1.5"><div className="min-w-0 flex-1"><dt className="text-[10px] text-slate-500 dark:text-slate-400">Dias na etapa</dt><dd className="font-medium text-slate-900 dark:text-white">{selectedCard.diasNaEtapa}</dd></div></div>
                </dl>
              )}
              {detailTab === 'compras' && (
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
            {detailTab !== 'compras' && (
              <div className="flex shrink-0 items-center justify-end border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                <button type="button" disabled={!hasCardChanges || isSavingCard} onClick={handleSaveCard} className={`rounded-lg px-5 py-2 text-xs font-bold transition-colors cursor-pointer hover:cursor-pointer ${hasCardChanges ? 'bg-[#051647] text-white hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D]' : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'}`}>
                  {isSavingCard ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>"""

content = content[:start_idx] + new_modal + content[end_idx:]

# 3. Add useEffect to sync cardDraft when selectedCard changes, plus hasCardChanges and handleSaveCard
# Insert after dialogReturnFocusRef declaration
ref_anchor = 'const dialogReturnFocusRef = useRef<HTMLElement | null>(null);'
ref_insert = """const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  // Sync card draft when selectedCard changes
  React.useEffect(() => {
    if (selectedCard) {
      setCardDraft({
        telefone: selectedCard.telefone,
        email: selectedCard.email,
        dataNascimento: selectedCard.dataNascimento,
        titulo: selectedCard.titulo,
        valor: selectedCard.valor,
      });
      setDetailTab('dados');
      setIsSavingCard(false);
    }
  }, [selectedCard?.id]);

  const hasCardChanges = selectedCard ? (
    cardDraft.telefone !== selectedCard.telefone ||
    cardDraft.email !== selectedCard.email ||
    cardDraft.dataNascimento !== selectedCard.dataNascimento ||
    cardDraft.titulo !== selectedCard.titulo ||
    cardDraft.valor !== selectedCard.valor
  ) : false;

  const handleSaveCard = async () => {
    if (!selectedCard) return;
    setIsSavingCard(true);
    try {
      setCards((prev) => prev.map((c) => c.id === selectedCard.id ? { ...c, ...cardDraft } : c));
      setSelectedCard((prev) => prev ? { ...prev, ...cardDraft } : null);
    } finally { setIsSavingCard(false); }
  };"""

if ref_anchor not in content:
    print('REF_ANCHOR_NOT_FOUND', file=sys.stderr); sys.exit(1)
content = content.replace(ref_anchor, ref_insert, 1)

open(path, 'w').write(content)
print('OK')