import { readFileSync, writeFileSync } from 'node:fs';

// Fix 1: Stepper viewport overflow-visible in bare mode
const stepperPath = process.argv[2] || 'crm/components/Stepper.tsx';
let stepper = readFileSync(stepperPath, 'utf8');
const oldViewport = "${!frame ? 'flex-1 overflow-y-auto' : ''}";
const newViewport = "${!frame ? 'flex-1 overflow-visible' : ''}";
if (stepper.includes(oldViewport)) {
  stepper = stepper.replaceAll(oldViewport, newViewport);
  writeFileSync(stepperPath, stepper);
  console.log('STEPPER_FIXED: overflow-visible applied');
} else if (stepper.includes(newViewport)) {
  console.log('STEPPER_SKIP: already has overflow-visible');
} else {
  console.log('STEPPER_WARN: could not find viewport overflow pattern');
}

// Fix 2: Deal Step 1 wrapper to fill available space (~80% of modal)
const pagePath = process.argv[3] || 'crm/app/page.tsx';
let page = readFileSync(pagePath, 'utf8');
const stepMarker = '<Step title="Contato" description="Vincule um contato">';
const oldDiv = '<div className="space-y-4">';
const newDiv = '<div className="flex min-h-[60vh] flex-col space-y-4">';

const stepIdx = page.indexOf(stepMarker);
if (stepIdx !== -1) {
  const afterMarker = page.substring(stepIdx);
  const divIdx = afterMarker.indexOf(oldDiv);
  if (divIdx !== -1) {
    const absoluteIdx = stepIdx + divIdx;
    page = page.substring(0, absoluteIdx) + newDiv + page.substring(absoluteIdx + oldDiv.length);
    writeFileSync(pagePath, page);
    console.log('PAGE_FIXED: Step 1 wrapper updated to min-h-[60vh]');
  } else {
    console.log('PAGE_WARN: could not find Step 1 div inside Contato step');
  }
} else {
  console.log('PAGE_WARN: could not find Contato step marker');
}