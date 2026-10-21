# Fix contatos and usuarios - remove duplicate buttons from header

# CONTATOS: remove lines 321-323 (the old header button)
with open('/opt/crm/crm/app/contatos/page.tsx', 'r') as f:
    lines = f.readlines()

# Find and remove the old header button (topbar-action-button with Novo Contato)
new_lines = []
skip_next = 0
for i, line in enumerate(lines):
    if skip_next > 0:
        skip_next -= 1
        continue
    if 'topbar-action-button' in line and i + 1 < len(lines) and 'Novo Contato' in lines[i + 1]:
        # Skip this line and the next two (button content + closing tag)
        skip_next = 2
        print(f'contatos: removed header button at line {i + 1}')
        continue
    new_lines.append(line)

with open('/opt/crm/crm/app/contatos/page.tsx', 'w') as f:
    f.writelines(new_lines)

# USUARIOS: remove lines 176-178 (the old header button)
with open('/opt/crm/crm/app/usuarios/page.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip_next = 0
for i, line in enumerate(lines):
    if skip_next > 0:
        skip_next -= 1
        continue
    if 'topbar-action-button' in line and i + 1 < len(lines) and 'Cadastrar usuário' in lines[i + 1]:
        skip_next = 2
        print(f'usuarios: removed header button at line {i + 1}')
        continue
    new_lines.append(line)

with open('/opt/crm/crm/app/usuarios/page.tsx', 'w') as f:
    f.writelines(new_lines)

print('\nFIX COMPLETE')