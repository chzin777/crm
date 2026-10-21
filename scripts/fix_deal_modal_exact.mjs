import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2] || 'crm/app/page.tsx';
let content = readFileSync(filePath, 'utf8');

// Bloco EXATO do modal de Nova Oportunidade a ser substituído (do {isCreateDealOpen até </EntityDialog>)
// Baseado na inspeção atual do servidor (linhas 1117-1335)
const oldDealModal = `{isCreateDealOpen && (
        <EntityDialog
          titleId="create-deal-title"
          title={editingCard ? "Editar oportunidade" : "Nova oportunidade"}
          description={editingCard ? "Atualize os dados desta oportunidade." : "Vincule uma oportunidade a um contato existente no banco."}
          onClose={() => setIsCreateDealOpen(false)}
          size="lg"
        >
            <Stepper
              indicator="numbers"
              transition="slide"
              linear
              validateStep={(step) => {
                if (step === 1) return !!dealContactId;
                if (step === 2) return !!dealTitle.trim();
                return true;
              }}
              onFinalStepCompleted={createDeal}
              backButtonText="Voltar"
              nextButtonText="Continuar"
              completeButtonText={editingCard ? "Salvar alterações" : "Criar oportunidade"}
              accentColor="#C4D600"
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

// Novo bloco replicando EXATAMENTE a estrutura do modal de Novo Contato
// (mesmas props, mesma indentação, sem wrapper div, sem botão Cancelar externo)
const newDealModal = `{isCreateDealOpen && (
        <EntityDialog
          titleId="create-deal-title"
          title={editingCard ? "Editar oportunidade" : "Nova oportunidade"}
          description={editingCard ? "Atualize os dados desta oportunidade." : "Vincule uma oportunidade a um contato existente no banco."}
          onClose={() => setIsCreateDealOpen(false)}
          size="lg"
        >
            <Stepper
              initialStep={1}
              onFinalStepCompleted={createDeal}
              validateStep={(step) => {
                if (step === 1) return !!dealContactId;
                if (step === 2) return !!dealTitle.trim();
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
            >`;

if (!content.includes(oldDealModal)) {
  console.error('ERROR: Could not find the exact Deal modal Stepper block to replace.');
  // Debug: mostrar o que existe no arquivo
  const idx = content.indexOf('titleId="create-deal-title"');
  if (idx !== -1) {
    console.error('Found create-deal-title at index', idx);
    console.error('Context:', content.substring(idx - 50, idx + 200));
  }
  process.exit(1);
}

content = content.replace(oldDealModal, newDealModal);
console.log('PASSO 1 OK: Stepper props atualizadas para corresponder exatamente ao Novo Contato');

// Remover botão Cancelar externo e seu wrapper div após </Stepper> no modal de Deal
// No modal de Novo Contato NÃO existe esse bloco; o footer do Stepper já tem os botões
const cancelBlock = `            </Stepper>
            <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
              <button type="button" onClick={() => setIsCreateDealOpen(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
            </div>
        </EntityDialog>`;

const cleanClose = `            </Stepper>
        </EntityDialog>`;

if (content.includes(cancelBlock)) {
  content = content.replace(cancelBlock, cleanClose);
  console.log('PASSO 2 OK: Botão Cancelar externo e wrapper div removidos');
} else {
  console.log('PASSO 2 SKIP: Bloco Cancelar não encontrado (já removido?)');
}

writeFileSync(filePath, content);
console.log('SCRIPT CONCLUÍDO:', filePath);