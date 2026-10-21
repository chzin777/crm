import { readFileSync, writeFileSync } from 'node:fs';

// === FIX 1: Deal Modal - replicate New Contact modal structure exactly ===
const pagePath = process.argv[2] || 'crm/app/page.tsx';
let pageContent = readFileSync(pagePath, 'utf8');

// Remove wrapper div inside EntityDialog for Deal modal
pageContent = pageContent.replace(
  /(size="lg"\s*>\s*)\r?\n\s*<div className="flex h-full min-h-0 flex-col">\s*\r?\n(\s*<Stepper)/,
  '$1\n$2'
);

// Replace Stepper props in Deal modal to match New Contact modal exactly
pageContent = pageContent.replace(
  /(<Stepper\s+indicator="numbers"\s+transition="slide"\s+linear\s+validateStep=\{[\s\S]*?\}\s+onFinalStepCompleted=\{createDeal\}\s+backButtonText="Voltar"\s+nextButtonText="Continuar"\s+completeButtonText=\{[\s\S]*?\}\s+accentColor="#C4D600")\s+theme="light"/,
  `$1
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
}}`
);

// Remove external Cancel button block after </Stepper> in Deal modal
pageContent = pageContent.replace(
  /(<\/Stepper>)\s*\r?\n\s*<div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">\s*\r?\n\s*<button[^>]*>Cancelar<\/button>\s*\r?\n\s*<\/div>(\s*\r?\n\s*<\/EntityDialog>)/,
  '$1$2'
);

writeFileSync(pagePath, pageContent);
console.log('FIXED: Deal modal structure in', pagePath);

// === FIX 2: formatDateBR - handle JS Date string format ===
const contactsPath = 'crm/app/contatos/page.tsx';
let contactsContent = readFileSync(contactsPath, 'utf8');

const oldFormatDateBR = `const formatDateBR = (value: string | null | undefined) => {
 if (!value) return "—";
 const match = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(value);
 return match ? \`\${match[3]}/\${match[2]}/\${match[1]}\` : value;
};`;

const newFormatDateBR = `const formatDateBR = (value: string | null | undefined) => {
 if (!value) return "—";
 const isoMatch = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(value);
 if (isoMatch) return \`\${isoMatch[3]}/\${isoMatch[2]}/\${isoMatch[1]}\`;
 // Handle JS Date string like "Wed Jul 08 1981 00:00:00 GMT-0300 ..."
 const dateObj = new Date(value);
 if (!isNaN(dateObj.getTime())) {
 const d = String(dateObj.getDate()).padStart(2, "0");
 const m = String(dateObj.getMonth() + 1).padStart(2, "0");
 const y = dateObj.getFullYear();
 return \`\${d}/\${m}/\${y}\`;
 }
 return value;
};`;

if (contactsContent.includes(oldFormatDateBR)) {
 contactsContent = contactsContent.replace(oldFormatDateBR, newFormatDateBR);
 writeFileSync(contactsPath, contactsContent);
 console.log('FIXED: formatDateBR in', contactsPath);
} else {
 console.log('WARNING: Could not find exact formatDateBR to patch. Trying flexible match...');
 // Flexible replacement
 contactsContent = contactsContent.replace(
 /const formatDateBR = \(value: string \| null \| undefined\) => \{[\s\S]*?return match \? `\$\{match\[3\]\}\/\$\{match\[2\]\}\/\$\{match\[1\]\}` : value;[\s\S]*?\};/,
 newFormatDateBR
 );
 writeFileSync(contactsPath, contactsContent);
 console.log('FIXED: formatDateBR (flexible match) in', contactsPath);
}

// === FIX 3: Bairro column - remove radius from display ===
const storesPath = 'crm/app/lojas/page.tsx';
let storesContent = readFileSync(storesPath, 'utf8');

const oldBairro = `{store.neighborhoods.length > 0 ? \`\${store.neighborhoods[0]}\${store.radiusKm > 0 ? \` · raio \${store.radiusKm} km\` : ""}\` : "Clientes vinculados pelas vendas"}`;
const newBairro = `{store.neighborhoods.length > 0 ? store.neighborhoods[0] : "Clientes vinculados pelas vendas"}`;

if (storesContent.includes(oldBairro)) {
 storesContent = storesContent.replace(oldBairro, newBairro);
 writeFileSync(storesPath, storesContent);
 console.log('FIXED: Bairro column in', storesPath);
} else {
 console.log('WARNING: Could not find exact Bairro rendering to patch.');
}

console.log('ALL FIXES APPLIED');