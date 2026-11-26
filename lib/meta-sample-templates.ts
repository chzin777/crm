/**
 * Modelos de amostra/padrão da própria Meta (hello_world, sample_* e os da biblioteca de modelos da Meta):
 * não foram criados pela Óticas Brasil, não podem ser editados nem excluídos e ficam fora de toda a interface.
 * Regra pura: usada na listagem da API (servidor) e nos seletores (navegador).
 */
export type TemplateIdentity = { name?: string | null; library_template_name?: string | null; libraryTemplateName?: string | null };

export function isMetaSampleTemplate(template: TemplateIdentity | null | undefined) {
  if (!template) return false;
  const name = String(template.name ?? "").trim().toLowerCase();
  if (name === "hello_world" || name.startsWith("sample_")) return true;
  return Boolean(String(template.library_template_name ?? template.libraryTemplateName ?? "").trim());
}

/** Só os modelos próprios da empresa. */
export const ownTemplates = <T extends TemplateIdentity>(templates: T[] | null | undefined): T[] =>
  (Array.isArray(templates) ? templates : []).filter((template) => !isMetaSampleTemplate(template));
