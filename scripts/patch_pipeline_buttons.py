import re

with open('/opt/crm/crm/app/page.tsx', 'r') as f:
    content = f.read()

# 1. Remove the "Criar" button from the header (lines ~635-643)
criar_pattern = r'\s*\{/\* Botão Criar estilo Dribbble \*/\}\s*\n\s*<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => openDealDialog\(\)\}\s*\n\s*className="topbar-action-button[^"]*"\s*\n\s*>\s*\n\s*<Plus className="w-3\.5 h-3\.5 stroke-\[3\]" />\s*\n\s*<span>Criar</span>\s*\n\s*</button>'
new_content = re.sub(criar_pattern, '', content)
if new_content == content:
    print('WARNING: Criar button pattern not matched!')
else:
    print('pipeline: Criar button removed from header')
    content = new_content

# 2. Replace the "Novo Deal" button with standardized h-10 style and move it
# First remove the old Novo Deal button from its current location
novo_deal_old_pattern = r'\s*<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => openDealDialog\(\)\}\s*\n\s*className="flex items-center gap-1\.5 bg-\[#051647\] dark:bg-\[#C4D600\] text-white dark:text-\[#051647\] px-4 py-1\.5 rounded-full text-xs font-bold shadow-xs hover:opacity-95 transition-all cursor-pointer hover:cursor-pointer"\s*\n\s*>\s*\n\s*<Plus className="w-3\.5 h-3\.5 stroke-\[2\.5\]" />\s*\n\s*<span>Novo Deal</span>\s*\n\s*</button>'
new_content = re.sub(novo_deal_old_pattern, '', content)
if new_content == content:
    print('WARNING: Novo Deal button pattern not matched!')
else:
    print('pipeline: Novo Deal button removed from old location')
    content = new_content

# 3. Insert standardized "Novo Deal" button right after <main ...>
BTN_CLASS = 'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#051647] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[#C4D600] dark:text-[#051647] dark:hover:bg-[#CFDB6D] cursor-pointer hover:cursor-pointer'

main_pattern = r'(<main className="flex-1 px-6 sm:px-8 pb-10">)'
btn_html = '''
          <div className="flex justify-end">
            <button type="button" onClick={() => openDealDialog()} className="''' + BTN_CLASS + '''">
              <Plus className="h-4 w-4" /> Novo Deal
            </button>
          </div>'''

replacement = r'\1' + btn_html
new_content = re.sub(main_pattern, replacement, content, count=1)
if new_content == content:
    print('WARNING: main pattern not matched!')
else:
    print('pipeline: Novo Deal button inserted below header with h-10')
    content = new_content

with open('/opt/crm/crm/app/page.tsx', 'w') as f:
    f.write(content)

print('\nPIPELINE BUTTONS STANDARDIZED')