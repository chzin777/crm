import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2] || 'crm/app/page.tsx';
let content = readFileSync(filePath, 'utf8');

// Bloco exato do modal de Nova Oportunidade a ser substituído (do EntityDialog até o botão Cancelar + </div>)
const oldDealModal = `{isCreateDealOpen && (
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

// Novo bloco do modal de Nova Oportunidade replicando exatamente a estrutura do modal de Novo Contato
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
  console.error('ERROR: Could not find the exact Deal modal block to replace.');
  console.error('Searching for partial match...');
  if (content.includes('titleId="create-deal-title"')) {
    console.error('Found create-deal-title but structure differs from expected.');
  }
  process.exit(1);
}

content = content.replace(oldDealModal, newDealModal);

// Remover o botão "Cancelar" externo e seu wrapper div que ficam após </Stepper> no modal de Deal
// No modal de Novo Contato NÃO existe esse botão externo; o footer do Stepper já tem os botões
const cancelBtnBlock = `            </Stepper>
            <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
              <button type="button" onClick={() => setIsCreateDealOpen(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer">Cancelar</button>
            </div>
          </EntityDialog>`;

const cancelBtnReplacement = `            </Stepper>
          </EntityDialog>`;

if (content.includes(cancelBtnBlock)) {
  content = content.replace(cancelBtnBlock, cancelBtnReplacement);
  console.log('Removed external Cancel button block.');
} else {
  console.log('WARNING: External Cancel button block not found (may have been already removed).');
}

writeFileSync(filePath, content);
console.log('PATCHED:', filePath);