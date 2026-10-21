import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2] || 'crm/app/page.tsx';
let content = readFileSync(filePath, 'utf8');

// 1. Restaurar o trigger setIsCreateDealOpen(true) que foi comentado
content = content.replace(
  '// DEAL_MODAL_REMOVED: setIsCreateDealOpen(true);',
  'setIsCreateDealOpen(true);'
);
console.log('PASSO 1 OK: Trigger restaurado');

// 2. Substituir o marcador de remoção pelo novo modal completo
const newDealModal = `{isCreateDealOpen && (
        <EntityDialog
          titleId="create-deal-title"
          title={editingCard ? "Editar oportunidade" : "Nova oportunidade"}
          description={editingCard ? "Atualize os dados desta oportunidade." : "Vincule uma oportunidade a um contato existente no banco."}
          onClose={() => { setIsCreateDealOpen(false); setDealError(""); }}
          size="lg"
        >
          <Stepper
            initialStep={1}
            onStepChange={() => setDealError("")}
            onFinalStepCompleted={createDeal}
            validateStep={(step) => {
              if (step === 1) {
                if (!dealContactId) {
                  setDealError("Selecione um contato para vincular à oportunidade.");
                  return false;
                }
              }
              if (step === 2) {
                if (!dealTitle.trim()) {
                  setDealError("Informe o nome da oportunidade.");
                  document.getElementById("deal-title-input")?.focus();
                  return false;
                }
              }
              setDealError("");
              return true;
            }}
            backButtonText="Voltar"
            nextButtonText="Continuar"
            completeButtonText={editingCard ? "Salvar alterações" : "Criar oportunidade"}
            indicator="numbers"
            orientation="horizontal"
            transition="slide"
            linear
            showFooter
            theme={isDark ? "dark" : "light"}
            accentColor="#C4D600"
            frame={false}
            radius={16}
            width="100%"
            className="min-h-0 flex-1"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
                event.preventDefault();
                const nextBtn = document.querySelector('[data-stepper="next"]') as HTMLButtonElement | null;
                nextBtn?.click();
              }
            }}
          >
            <Step title="Contato" description="Vincule um contato">
              <div className="space-y-4">
                <div><h3 className="text-sm font-semibold text-[#051647] dark:text-white">Selecione o contato</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escolha um cliente ou lead existente para vincular a esta oportunidade.</p></div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Contato <span aria-hidden="true" className="text-[#F7915E]">*</span></span>
                  <div className="relative" ref={dealContactRef}>
                    <input
                      id="deal-contact-search"
                      type="text"
                      role="combobox"
                      aria-expanded={isDealContactOpen}
                      aria-controls="deal-contact-listbox"
                      autoComplete="off"
                      placeholder={contactsLoading ? "Carregando contatos..." : dealContactId ? ((contacts.find((c) => c.id === dealContactId) ?? dealContactResults.find((c) => c.id === dealContactId))?.nome ?? "Pesquisar contato...") : "Pesquisar contato..."}
                      value={dealContactSearch}
                      onChange={(event) => {
                        setDealContactSearch(event.target.value);
                        if (!isDealContactOpen) setIsDealContactOpen(true);
                      }}
                      onFocus={() => {
                        if (dealContactId) {
                          const selected = contacts.find((c) => c.id === dealContactId) ?? dealContactResults.find((c) => c.id === dealContactId);
                          setDealContactSearch(selected?.nome ?? "");
                        }
                        setIsDealContactOpen(true);
                      }}
                      disabled={contactsLoading || contacts.length === 0}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm font-normal text-slate-900 outline-none transition-all focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/20 cursor-pointer hover:cursor-pointer"
                    />
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    {isDealContactOpen && (
                      <ul
                        id="deal-contact-listbox"
                        role="listbox"
                        className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
                      >
                        {filteredDealContacts.length === 0 && (
                          <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Nenhum contato encontrado.</li>
                        )}
                        {filteredDealContacts.map((contact) => {
                          const isSelected = contact.id === dealContactId;
                          return (
                            <li
                              key={contact.id}
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setDealContactId(contact.id);
                                setDealContactSearch(contact.nome);
                                setIsDealContactOpen(false);
                                setDealError("");
                              }}
                              className={\`flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 \${isSelected ? "bg-slate-100 dark:bg-slate-700" : ""}\`}
                            >
                              <span className="font-medium text-slate-900 dark:text-white">{contact.nome}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">{contact.telefone}{contact.email ? \` · \${contact.email}\` : ""}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </label>
                {contacts.length === 0 && !contactsLoading && !contactsError && (
                  <p className="text-xs text-slate-500">Cadastre um contato antes de criar uma oportunidade.</p>
                )}
                {dealError && <p role="alert" className="rounded-md bg-[#F7915E]/10 px-3 py-2 text-xs font-medium text-[#9a3d12] dark:bg-[#F7915E]/15 dark:text-[#F7915E]">{dealError}</p>}
              </div>
            </Step>
            <Step title="Detalhes" description="Dados da oportunidade">
              <div className="space-y-4">
                <div><h3 className="text-sm font-semibold text-[#051647] dark:text-white">Dados da oportunidade</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Defina o título, valor e observações desta oportunidade.</p></div>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Nome da oportunidade <span aria-hidden="true" className="text-[#F7915E]">*</span></span>
                  <input
                    id="deal-title-input"
                    value={dealTitle}
                    onChange={(event) => { setDealTitle(event.target.value); setDealError(""); }}
                    placeholder="Ex.: Orçamento de lentes progressivas"
                    maxLength={200}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition-all focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/20"
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Valor estimado
                  <input
                    value={dealValue}
                    onChange={(event) => setDealValue(event.target.value)}
                    placeholder="R$ 0,00"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition-all focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/20"
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Observações
                  <textarea
                    value={dealNotes}
                    onChange={(event) => setDealNotes(event.target.value)}
                    placeholder="Anotações sobre esta oportunidade..."
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none transition-all focus:border-[#002187] focus:ring-2 focus:ring-[#002187]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#C4D600] dark:focus:ring-[#C4D600]/20"
                  />
                </label>
                <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Imagem (opcional)</label>
                  <input type="file" accept="image/*" ref={dealImageInputRef} className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 16 * 1024 * 1024) { toast.error("Imagem muito grande", "Máximo 16MB."); return; }
                    const reader = new FileReader();
                    reader.onload = () => setNewDealImage(reader.result as string);
                    reader.readAsDataURL(file);
                  }} />
                  {newDealImage ? (
                    <div className="relative inline-block">
                      <img src={newDealImage} alt="Preview" className="h-24 w-24 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
                      <button type="button" onClick={() => { setNewDealImage(null); if (dealImageInputRef.current) dealImageInputRef.current.value = ""; }} className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow cursor-pointer hover:cursor-pointer"><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => dealImageInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-600 hover:border-[#002187] hover:text-[#002187] dark:border-slate-600 dark:text-slate-400 dark:hover:border-[#C4D600] dark:hover:text-[#C4D600] cursor-pointer hover:cursor-pointer">
                      <Paperclip className="h-3.5 w-3.5" /> Anexar imagem
                    </button>
                  )}
                </div>
                {dealError && <p role="alert" className="rounded-md bg-[#F7915E]/10 px-3 py-2 text-xs font-medium text-[#9a3d12] dark:bg-[#F7915E]/15 dark:text-[#F7915E]">{dealError}</p>}
              </div>
            </Step>
            <Step title="Revisão" description="Confira os dados">
              <div className="space-y-4">
                <div><h3 className="text-sm font-semibold text-[#051647] dark:text-white">Revise a oportunidade</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Confirme os dados antes de criar ou atualizar.</p></div>
                <dl className="divide-y divide-slate-200 rounded-xl border border-[#002187]/10 bg-gradient-to-br from-white to-slate-50 px-4 dark:divide-slate-700 dark:border-[#C4D600]/10 dark:from-slate-800/50 dark:to-slate-800/30">
                  <div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-[#002187] dark:text-[#C4D600]">Contato</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{(contacts.find((c) => c.id === dealContactId) ?? dealContactResults.find((c) => c.id === dealContactId))?.nome ?? "Não selecionado"}</dd></div>
                  <div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-[#002187] dark:text-[#C4D600]">Oportunidade</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{dealTitle.trim() || "Não informado"}</dd></div>
                  <div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-[#002187] dark:text-[#C4D600]">Valor</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{dealValue.trim() || "A definir"}</dd></div>
                  <div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-[#002187] dark:text-[#C4D600]">Observações</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-200">{dealNotes.trim() || "Nenhuma"}</dd></div>
                </dl>
                {dealError && <p role="alert" className="rounded-md bg-[#F7915E]/10 px-3 py-2 text-xs font-medium text-[#9a3d12] dark:bg-[#F7915E]/15 dark:text-[#F7915E]">{dealError}</p>}
              </div>
            </Step>
          </Stepper>
        </EntityDialog>
      )}`;

content = content.replace('{/* DEAL_MODAL_REMOVED */}', newDealModal);
console.log('PASSO 2 OK: Novo modal de Nova Oportunidade inserido');

writeFileSync(filePath, content);
console.log('SCRIPT CONCLUÍDO:', filePath);