import re

with open('/opt/crm/crm/app/painel/page.tsx', 'r') as f:
    content = f.read()

# 1. Add Send to lucide imports
content = content.replace(
    ' Target,\n} from "lucide-react";',
    ' Send,\n Target,\n} from "lucide-react";'
)

# 2. Add useRouter import after Link import
content = content.replace(
    'import Link from "next/link";',
    'import Link from "next/link";\nimport { useRouter } from "next/navigation";'
)

# 3. Add wizard state inside the component, after currentDate state
content = content.replace(
    'const [currentDate, setCurrentDate] = useState<Date | null>(null);',
    '''const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);'''
)

# 4. Wizard modal + button section
wizard_html = '''
          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07194f] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600]"><Send className="h-4 w-4" /></span>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Iniciar nova campanha</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Crie contatos, segmentos ou dispare mensagens em poucos passos.</p>
              </div>
            </div>
            <button type="button" onClick={() => setWizardOpen(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#051647] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
              Iniciar agora
            </button>
          </section>

          {wizardOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setWizardOpen(false)}>
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#051647]" onClick={(e) => e.stopPropagation()}>
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">O que deseja fazer?</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Escolha uma opção para continuar.</p>
                  </div>
                  <button type="button" onClick={() => setWizardOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
                <div className="space-y-2">
                  <button type="button" onClick={() => { setWizardOpen(false); router.push("/contatos?acao=novo"); }} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-all hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#002187] transition-colors group-hover:bg-[#002187] group-hover:text-white dark:bg-blue-950/50 dark:text-[#C4D600] dark:group-hover:bg-[#C4D600] dark:group-hover:text-[#051647]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Criar novo contato</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Cadastre uma pessoa antes de enviar mensagens.</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => { setWizardOpen(false); router.push("/segmentos?acao=novo"); }} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-all hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950/40 dark:text-emerald-300 dark:group-hover:bg-[#C4D600] dark:group-hover:text-[#051647]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Criar segmento</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Agrupe contatos por critérios para campanhas direcionadas.</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => { setWizardOpen(false); router.push("/campanhas?acao=nova"); }} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-all hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#C4D600]/20 text-[#051647] transition-colors group-hover:bg-[#C4D600] group-hover:text-[#051647] dark:bg-[#C4D600]/15 dark:text-[#C4D600] dark:group-hover:bg-[#C4D600] dark:group-hover:text-[#051647]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Nova campanha</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure e envie uma mensagem do zero.</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => { setWizardOpen(false); router.push("/campanhas?acao=disparar"); }} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left transition-all hover:border-[#002187] hover:bg-[#002187]/5 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-[#C4D600] dark:hover:bg-[#C4D600]/10 cursor-pointer">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-50 text-[#b94a15] transition-colors group-hover:bg-[#F7915E] group-hover:text-white dark:bg-orange-950/30 dark:text-[#F7915E] dark:group-hover:bg-[#F7915E] dark:group-hover:text-[#051647]">
                      <Send className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Disparar existente</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Envie uma campanha já criada anteriormente.</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
'''

# Insert before </main>
content = content.replace('        </main>', wizard_html + '\n        </main>')

with open('/opt/crm/crm/app/painel/page.tsx', 'w') as f:
    f.write(content)

print('PAINEL PATCHED OK')