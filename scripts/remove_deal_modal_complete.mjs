import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2] || 'crm/app/page.tsx';
let content = readFileSync(filePath, 'utf8');
let changed = false;

// 1. Remove the Deal modal JSX block: from {isCreateDealOpen && ( to matching )}
const modalStart = '{isCreateDealOpen && (';
const startIdx = content.indexOf(modalStart);
if (startIdx !== -1) {
  // Find </Stepper>\n        </EntityDialog>\n      )} which is the exact closing pattern
  const closePattern = '</Stepper>\n        </EntityDialog>\n      )}';
  const closeIdx = content.indexOf(closePattern, startIdx);
  if (closeIdx !== -1) {
    const endIdx = closeIdx + closePattern.length;
    // Include leading whitespace/newline
    let blockStart = startIdx;
    while (blockStart > 0 && (content[blockStart - 1] === ' ' || content[blockStart - 1] === '\t')) {
      blockStart--;
    }
    if (blockStart > 0 && content[blockStart - 1] === '\n') {
      blockStart--;
    }
    content = content.substring(0, blockStart) + '\n      {/* DEAL_MODAL_REMOVED */}' + content.substring(endIdx);
    console.log(`PASSO 1 OK: Modal JSX block removed (${endIdx - startIdx} chars)`);
    changed = true;
  } else {
    console.log('PASSO 1 ERROR: Could not find modal closing pattern');
  }
} else {
  console.log('PASSO 1 SKIP: Deal modal block not found');
}

// 2. Comment out the trigger setIsCreateDealOpen(true)
const triggerPattern = /^(\s*)setIsCreateDealOpen\(true\);$/m;
if (triggerPattern.test(content)) {
  content = content.replace(triggerPattern, '$1// DEAL_TRIGGER_REMOVED: setIsCreateDealOpen(true);');
  console.log('PASSO 2 OK: Trigger commented out');
  changed = true;
} else {
  console.log('PASSO 2 SKIP: Trigger not found or already removed');
}

// 3. Remove createDeal function (from "const createDeal = () => {" to the closing of setNewDealImage(null); })
const createDealStart = '  const createDeal = () => {';
const createDealEnd = '    setNewDealImage(null);\n  }';
const cdStartIdx = content.indexOf(createDealStart);
const cdEndIdx = content.indexOf(createDealEnd, cdStartIdx);
if (cdStartIdx !== -1 && cdEndIdx !== -1) {
  const cdFullEnd = cdEndIdx + createDealEnd.length;
  // Include trailing newline
  let removeEnd = cdFullEnd;
  if (content[removeEnd] === '\n') removeEnd++;
  content = content.substring(0, cdStartIdx) + '  // DEAL_FUNC_REMOVED: createDeal\n' + content.substring(removeEnd);
  console.log('PASSO 3 OK: createDeal function removed');
  changed = true;
} else {
  console.log('PASSO 3 SKIP: createDeal function not found');
}

// 4. Remove click-outside effect for deal contact dropdown
const clickOutsideStart = '  // Click-outside handler for deal contact dropdown\n  useEffect(() => {';
const clickOutsideEnd = '  }, [isDealContactOpen, dealContactId, contacts, dealContactResults]);';
const coStartIdx = content.indexOf(clickOutsideStart);
const coEndIdx = content.indexOf(clickOutsideEnd, coStartIdx);
if (coStartIdx !== -1 && coEndIdx !== -1) {
  const coFullEnd = coEndIdx + clickOutsideEnd.length;
  let removeEnd = coFullEnd;
  if (content[removeEnd] === '\n') removeEnd++;
  if (content[removeEnd] === '\n') removeEnd++;
  content = content.substring(0, coStartIdx) + '  // DEAL_EFFECT_REMOVED: click-outside handler\n' + content.substring(removeEnd);
  console.log('PASSO 4 OK: Click-outside effect removed');
  changed = true;
} else {
  console.log('PASSO 4 SKIP: Click-outside effect not found');
}

// 5. Remove deal contact search effect (useEffect with dealContactSearch dependency)
const searchEffectStart = '  useEffect(() => {\n    const term = dealContactSearch.trim();';
const searchEffectEnd = '  }, [dealContactSearch, contacts]);';
const seStartIdx = content.indexOf(searchEffectStart);
const seEndIdx = content.indexOf(searchEffectEnd, seStartIdx);
if (seStartIdx !== -1 && seEndIdx !== -1) {
  const seFullEnd = seEndIdx + searchEffectEnd.length;
  let removeEnd = seFullEnd;
  if (content[removeEnd] === '\n') removeEnd++;
  if (content[removeEnd] === '\n') removeEnd++;
  content = content.substring(0, seStartIdx) + '  // DEAL_EFFECT_REMOVED: deal contact search\n' + content.substring(removeEnd);
  console.log('PASSO 5 OK: Deal contact search effect removed');
  changed = true;
} else {
  console.log('PASSO 5 SKIP: Deal contact search effect not found');
}

// Clean up multiple consecutive blank lines
content = content.replace(/\n{3,}/g, '\n\n');

if (changed) {
  writeFileSync(filePath, content);
  console.log('SCRIPT CONCLUÍDO:', filePath);
} else {
  console.log('NENHUMA ALTERAÇÃO FEITA');
}