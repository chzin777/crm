import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2] || 'crm/app/page.tsx';
let content = readFileSync(filePath, 'utf8');

// === PASSO 1: Remover o wrapper div dentro do EntityDialog do Deal ===
const wrapperDiv = `          <div className="flex h-full min-h-0 flex-col">
            <Stepper`;
const stepperDirect = `            <Stepper`;

if (content.includes(wrapperDiv)) {
  content = content.replace(wrapperDiv, stepperDirect);
  console.log('PASSO 1 OK: Wrapper div removido');
} else {
  console.log('PASSO 1 SKIP: Wrapper div já removido ou não encontrado');
}

// === PASSO 2: Substituir props do Stepper (theme="light" → frame={false} + theme dinâmico) ===
const oldProps = `              accentColor="#C4D600"
              theme="light"
            >`;
const newProps = `              accentColor="#C4D600"
              frame={false}
              radius={16}
              width="100%"
              className="min-h-0 flex-1"
              showFooter
              theme={isDark ? "dark" : "light"}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
                  event.preventDefault();
                  const nextBtn = document.querySelector('[data-stepper="next"]') as HTMLButtonElement | null;
                  nextBtn?.click();
                }
              }}
            >`;

if (content.includes(oldProps)) {
  content = content.replace(oldProps, newProps);
  console.log('PASSO 2 OK: Props do Stepper atualizadas');
} else {
  console.log('PASSO 2 SKIP: Props antigas não encontradas (já aplicadas?)');
}

// === PASSO 3: Remover botão Cancelar externo e seu wrapper div após </Stepper> ===
// No modal de Novo Contato NÃO existe esse bloco; o footer do Stepper já tem os botões
const cancelBlock = `            </Stepper>
            <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
              <button type="button" onClick={() => setIsCreateDealOpen(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
            </div>
          </div>
        </EntityDialog>`;
const cleanClose = `            </Stepper>
        </EntityDialog>`;

if (content.includes(cancelBlock)) {
  content = content.replace(cancelBlock, cleanClose);
  console.log('PASSO 3 OK: Botão Cancelar externo e wrapper div removidos');
} else {
  console.log('PASSO 3 SKIP: Bloco Cancelar não encontrado (já removido?)');
}

writeFileSync(filePath, content);
console.log('SCRIPT CONCLUÍDO:', filePath);