import { NextResponse } from "next/server";
import { requireModule } from "@/lib/api-auth";
import { loadSkills, saveSkills } from "@/lib/ai/studio-db";

/** Skills da IA (Estúdio): liga/desliga e instruções extras de cada habilidade nativa. */
export async function GET() {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  return NextResponse.json({ skills: await loadSkills() });
}

export async function PUT(request: Request) {
  const guard = await requireModule("ia", "configuracoes");
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { skills?: { key: string; enabled: boolean; instructions?: string }[] } | null;
  if (!Array.isArray(body?.skills)) return NextResponse.json({ error: "Envie a lista de skills." }, { status: 400 });
  const skills = await saveSkills(body.skills.map((skill) => ({ key: String(skill.key), enabled: skill.enabled !== false, instructions: String(skill.instructions ?? "") })));
  return NextResponse.json({ skills });
}
