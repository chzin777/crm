with open('/opt/crm/crm/app/painel/page.tsx', 'r') as f:
    content = f.read()

# 1. Remove the button from next to the title (restore original title div)
old_title_with_button = '''            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Painel</h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Visão geral do desempenho e relacionamento com clientes.</p>
              </div>
              <button type="button" onClick={() => setWizardOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#051647] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
                <Send className="h-3.5 w-3.5" /> Iniciar nova campanha
              </button>
            </div>'''

new_title_plain = '''            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Painel</h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Visão geral do desempenho e relacionamento com clientes.</p>
            </div>'''

content = content.replace(old_title_with_button, new_title_plain)

# 2. Replace the period filter label to include the button next to it
old_filter = '''            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span className="sr-only">Período do painel</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="bg-transparent outline-none">
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="12m">Últimos 12 meses</option>
              </select>
            </label>'''

new_filter_with_button = '''            <div className="flex items-center gap-2">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#07194f] dark:text-slate-300">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <span className="sr-only">Período do painel</span>
                <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="bg-transparent outline-none">
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="12m">Últimos 12 meses</option>
                </select>
              </label>
              <button type="button" onClick={() => setWizardOpen(true)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#051647] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer">
                <Send className="h-3.5 w-3.5" /> Iniciar nova campanha
              </button>
            </div>'''

content = content.replace(old_filter, new_filter_with_button)

with open('/opt/crm/crm/app/painel/page.tsx', 'w') as f:
    f.write(content)

print('FILTER BUTTON PATCHED OK')