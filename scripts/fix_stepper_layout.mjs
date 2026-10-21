import { readFileSync, writeFileSync } from 'node:fs';
const filePath = process.argv[2] || 'crm/components/Stepper.tsx';
let content = readFileSync(filePath, 'utf8');

// Fix 1: Make the main content wrapper flex-1 with min-h-0 when frame=false
// This ensures the viewport takes available space and footer stays at bottom
const oldContentWrapper = "className={`flex min-w-0 flex-col ${rail ? 'flex-1 pt-[var(--stepper-inset)] pr-[var(--stepper-inset)] pb-[var(--stepper-inset)] pl-5' : 'px-[var(--stepper-inset)] pt-5 pb-[var(--stepper-inset)]'}`}";
const newContentWrapper = "className={`flex min-w-0 flex-col ${rail ? 'flex-1 pt-[var(--stepper-inset)] pr-[var(--stepper-inset)] pb-[var(--stepper-inset)] pl-5' : 'flex-1 min-h-0 px-[var(--stepper-inset)] pt-5 pb-[var(--stepper-inset)]'}`}";

if (content.includes(oldContentWrapper)) {
  content = content.replace(oldContentWrapper, newContentWrapper);
  console.log('FIX 1 OK: Content wrapper now flex-1 min-h-0');
} else {
  console.log('FIX 1 SKIP: Content wrapper already fixed or not found');
}

// Fix 2: Make viewport flex-1 with overflow-y-auto when frame=false so content scrolls independently
const oldViewport = '<div ref={viewportRef} className={`${VIEWPORT_CLASS} ${contentClassName}`.trim()} aria-live="polite">';
const newViewport = '<div ref={viewportRef} className={`${VIEWPORT_CLASS} ${!frame ? \'flex-1 overflow-y-auto\' : \'\'} ${contentClassName}`.trim()} aria-live="polite">';

if (content.includes(oldViewport)) {
  content = content.replace(oldViewport, newViewport);
  console.log('FIX 2 OK: Viewport now scrollable in bare mode');
} else {
  console.log('FIX 2 SKIP: Viewport already fixed or not found');
}

writeFileSync(filePath, content);
console.log('STEPPER LAYOUT FIX COMPLETE');