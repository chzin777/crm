import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/api-auth";
import { invalidateCache } from "@/lib/cache";
import { STAGE_PROGRESS } from "@/lib/pipeline-stages";

type Card = { pipelineId?: string; contactId?: string; coluna?: string };

const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

/** Coloca o cliente na etapa "Reativação" do pipeline de relacionamento (sem duplicar card existente). */
export async function POST(request: Request) {
  const guard = await requireModule("painel");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { contactId?: unknown } | null;
  const contactId = typeof body?.contactId === "string" ? body.contactId : "";
  if (!contactId) return Response.json({ error: "Cliente inválido." }, { status: 400 });

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, phone: true, email: true, birthDate: true, segment: true, totalSpent: true },
  });
  if (!contact) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    // Mesmo lock da sincronização automática do pipeline, para não duplicar cards.
    await tx.$queryRaw`WITH advisory_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(730021, 1)) SELECT 1::int AS locked FROM advisory_lock`;
    const row = await tx.crmWorkspaceData.findUnique({ where: { key: "pipeline" } });
    const cards = Array.isArray(row?.value) ? (row.value as unknown as Card[]) : [];
    const existing = cards.find((card) => card.pipelineId === "relacionamento" && card.contactId === contactId);
    if (existing) return { added: false, stage: existing.coluna ?? "" };
    const total = contact.totalSpent.toNumber();
    const card = {
      id: crypto.randomUUID(),
      pipelineId: "relacionamento",
      titulo: `Relacionamento - ${contact.name}`,
      cliente: contact.name,
      telefone: contact.phone ?? "",
      email: contact.email ?? "",
      dataNascimento: contact.birthDate ?? "",
      ultimasCompras: [],
      tag: contact.segment || "Cliente",
      tagColor: "bg-[#C4D600]/20 text-[#051647] dark:text-[#C4D600]",
      valor: `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      progresso: STAGE_PROGRESS.reativacao,
      progressoCor: "bg-[#C4D600]",
      diasNaEtapa: "Novo",
      iniciais: initials(contact.name),
      coluna: "reativacao",
      mensagem: "",
      contactId: contact.id,
      entrouEmEtapaEm: new Date().toISOString(),
    };
    const updated = [card, ...cards];
    await tx.crmWorkspaceData.upsert({
      where: { key: "pipeline" },
      update: { value: updated as never, updatedAt: new Date() },
      create: { key: "pipeline", value: updated as never, updatedAt: new Date() },
    });
    return { added: true, stage: "reativacao" };
  }, { maxWait: 10_000, timeout: 60_000 });

  if (result.added) await invalidateCache("dashboard");
  return Response.json(result);
}
