import re

# Button style padrão: h-10 para altura uniforme
BTN_CLASS = 'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#051647] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer'

pages = {
    'contatos': {
        'path': '/opt/crm/crm/app/contatos/page.tsx',
        # Botão dentro do header - remover
        'header_btn_pattern': r'\s*<button type="button" onClick=\{[^}]*setIsCreateOpen\(true\)[^}]*\} className="topbar-action-button[^"]*">\s*\n\s*<Plus className="w-4 h-4" /> Novo Contato\s*\n\s*</button>',
        # Onde inserir o botão: logo após <main ...>
        'main_pattern': r'(<main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">)',
        'btn_html': '''
          <div className="flex justify-end">
            <button type="button" onClick={() => { setForm({ nome: "", telefone: "", email: "", dataNascimento: "", categoria: "lead", segmento: [] }); setFormError(""); setIsCreateOpen(true); }} className="''' + BTN_CLASS + '''">
              <Plus className="h-4 w-4" /> Novo contato
            </button>
          </div>''',
    },
    'segmentos': {
        'path': '/opt/crm/crm/app/segmentos/page.tsx',
        'header_btn_pattern': r'\s*<button type="button" onClick=\{\(\) => setIsCreateOpen\(true\)\} className="topbar-action-button[^"]*">\s*\n\s*<Plus className="h-4 w-4" /> Criar segmento\s*\n\s*</button>',
        'main_pattern': r'(<main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">)',
        'btn_html': '''
          <div className="flex justify-end">
            <button type="button" onClick={() => setIsCreateOpen(true)} className="''' + BTN_CLASS + '''">
              <Plus className="h-4 w-4" /> Criar segmento
            </button>
          </div>''',
    },
    'lojas': {
        'path': '/opt/crm/crm/app/lojas/page.tsx',
        'header_btn_pattern': r'\s*<button type="button" onClick=\{\(\) => openForm\("new"\)\} className="topbar-action-button[^"]*">\s*\n\s*<Plus className="h-4 w-4" /> Cadastrar loja\s*\n\s*</button>',
        'main_pattern': r'(<main className="space-y-6 p-8">)',
        'btn_html': '''
          <div className="flex justify-end">
            <button type="button" onClick={() => openForm("new")} className="''' + BTN_CLASS + '''">
              <Plus className="h-4 w-4" /> Cadastrar loja
            </button>
          </div>''',
    },
    'campanhas': {
        'path': '/opt/crm/crm/app/campanhas/page.tsx',
        'header_btn_pattern': r'\s*<button type="button" onClick=\{openCreateCampaign\} className="topbar-action-button[^"]*">\s*\n\s*<Plus className="h-4 w-4" /> Nova campanha\s*\n\s*</button>',
        'main_pattern': r'(<main className="space-y-6 px-6 pb-10 pt-8 sm:px-8">)',
        'btn_html': '''
          <div className="flex justify-end">
            <button type="button" onClick={openCreateCampaign} className="''' + BTN_CLASS + '''">
              <Plus className="h-4 w-4" /> Nova campanha
            </button>
          </div>''',
    },
    'usuarios': {
        'path': '/opt/crm/crm/app/usuarios/page.tsx',
        'header_btn_pattern': r'\s*<button type="button" onClick=\{openCreate\} className="topbar-action-button[^"]*">\s*\n\s*<Plus className="h-4 w-4" /> Cadastrar usuário\s*\n\s*</button>',
        'main_pattern': r'(<main className="space-y-6 p-8">)',
        'btn_html': '''
          <div className="flex justify-end">
            <button type="button" onClick={openCreate} className="''' + BTN_CLASS + '''">
              <Plus className="h-4 w-4" /> Cadastrar usuário
            </button>
          </div>''',
    },
}

for name, cfg in pages.items():
    path = cfg['path']
    with open(path, 'r') as f:
        content = f.read()

    # 1. Remover botão do header
    new_content = re.sub(cfg['header_btn_pattern'], '', content)
    if new_content == content:
        print(f'WARNING: {name} - header button pattern not matched!')
    else:
        print(f'{name}: header button removed')
    content = new_content

    # 2. Inserir botão abaixo do main
    replacement = cfg['main_pattern'].replace('(', '') .replace(')', '') + cfg['btn_html']
    new_content = re.sub(cfg['main_pattern'], replacement, content, count=1)
    if new_content == content:
        print(f'WARNING: {name} - main pattern not matched!')
    else:
        print(f'{name}: button inserted below header')
    content = new_content

    with open(path, 'w') as f:
        f.write(content)

print('\nALL PAGES STANDARDIZED')