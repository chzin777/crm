import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2] || 'crm/app/page.tsx';
let content = readFileSync(filePath, 'utf8');
let changed = false;

// 1. Remove o botão/trigger que abre o modal (linha 452: setIsCreateDealOpen(true);)
// Precisamos comentar ou remover a linha exata que seta isCreateDealOpen para true
const triggerPattern = /^(\s*)setIsCreateDealOpen\(true\);$/m;
if (triggerPattern.test(content)) {
  content = content.replace(triggerPattern, '$1// DEAL_MODAL_REMOVED: setIsCreateDealOpen(true);');
  console.log('PASSO 1 OK: Trigger setIsCreateDealOpen(true) comentado');
  changed = true;
} else {
  console.log('PASSO 1 SKIP: Trigger não encontrado ou já removido');
}

// 2. Remove todo o bloco do modal EntityDialog de Nova Oportunidade
// O bloco começa com {isCreateDealOpen && ( e termina com </EntityDialog>\n      )}
// Usamos uma abordagem de busca por string literal para o início e fim
const modalStart = '{isCreateDealOpen && (\n        <EntityDialog\n          titleId="create-deal-title"';
const modalEndMarker = '</EntityDialog>\n      )}';

const startIdx = content.indexOf(modalStart);
if (startIdx !== -1) {
  // Encontrar o fechamento correto: buscar </EntityDialog> seguido de )} após o início
  const searchFrom = startIdx + modalStart.length;
  let endIdx = -1;
  let pos = searchFrom;

  // Contar níveis de EntityDialog aninhados para encontrar o fechamento correto
  let depth = 1;
  while (pos < content.length && depth > 0) {
    const nextOpen = content.indexOf('<EntityDialog', pos);
    const nextClose = content.indexOf('</EntityDialog>', pos);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 13;
    } else {
      depth--;
      if (depth === 0) {
        // Verificar se é seguido por \n      )}
        const afterClose = nextClose + '</EntityDialog>'.length;
        const remaining = content.substring(afterClose, afterClose + 20);
        if (remaining.match(/^\s*\)\}/)) {
          endIdx = afterClose + remaining.match(/^\s*\)\}/)[0].length;
        } else {
          endIdx = nextClose + '</EntityDialog>'.length;
        }
        break;
      }
      pos = nextClose + 15;
    }
  }

  if (endIdx !== -1) {
    // Incluir qualquer whitespace/newline antes do bloco para limpeza
    let blockStart = startIdx;
    while (blockStart > 0 && (content[blockStart - 1] === ' ' || content[blockStart - 1] === '\t')) {
      blockStart--;
    }
    // Se houver newline antes, incluir também
    if (blockStart > 0 && content[blockStart - 1] === '\n') {
      blockStart--;
    }

    const removedBlock = content.substring(blockStart, endIdx);
    content = content.substring(0, blockStart) + '\n      {/* DEAL_MODAL_REMOVED */}' + content.substring(endIdx);
    console.log(`PASSO 2 OK: Bloco do modal removido (${removedBlock.length} chars)`);
    changed = true;
  } else {
    console.log('PASSO 2 ERROR: Não foi possível encontrar o fechamento do modal');
  }
} else {
  console.log('PASSO 2 SKIP: Bloco do modal não encontrado ou já removido');
}

if (changed) {
  writeFileSync(filePath, content);
  console.log('SCRIPT CONCLUÍDO:', filePath);
} else {
  console.log('NENHUMA ALTERAÇÃO FEITA');
}