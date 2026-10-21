import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2] || 'crm/app/page.tsx';
let content = readFileSync(filePath, 'utf8');

// 1. Remove the wrapper div inside EntityDialog for Deal modal
content = content.replace(
  /(size="lg"\s*>\s*)\r?\n\s*<div className="flex h-full min-h-0 flex-col">\s*\r?\n(\s*<Stepper)/,
  '$1\n$2'
);

// 2. Replace the entire Stepper opening tag in Deal modal to match New Contact modal exactly
// Match from <Stepper up to the first > that closes the opening tag
content = content.replace(
  /<Stepper\s+indicator="numbers"\s+transition="slide"\s+linear\s+validateStep=\{[\s\S]*?\}\s+onFinalStepCompleted=\{createDeal\}\s+backButtonText="Voltar"\s+nextButtonText="Continuar"\s+completeButtonText=\{[\s\S]*?\}\s+accentColor="#C4D600"[\s\S]*?>/,
  `<Stepper
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
            >`
);

// 3. Remove the orphan closing </div> after the Cancelar button div and before </EntityDialog>
content = content.replace(
  /(cursor-pointer hover:cursor-pointer">Cancelar<\/button>\s*\r?\n\s*<\/div>)\s*\r?\n\s*<\/div>(\s*\r?\n\s*<\/EntityDialog>)/,
  '$1$2'
);

writeFileSync(filePath, content);
console.log('PATCHED:', filePath);