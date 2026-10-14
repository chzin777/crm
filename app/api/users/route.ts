import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET() {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, jobTitle: true, teamLevel: true, role: true, createdAt: true },
  });
  return Response.json({ data: users });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  jobTitle: z.string().trim().min(1).max(200),
  role: z.enum(["admin", "supervisor", "user"]),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  jobTitle: z.string().trim().min(1).max(200),
  role: z.enum(["admin", "supervisor", "user"]),
});

export async function POST(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Somente administradores podem convidar usuários." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revise os dados do usuário." }, { status: 400 });

  const { name, email, jobTitle, role } = parsed.data;
  const result = await auth.api.createUser({
    headers: await headers(),
    body: {
      name,
      email,
      role: role === "admin" ? "admin" : "user",
      data: { jobTitle, teamLevel: role === "user" ? "Operador" : role === "supervisor" ? "Supervisor" : "Administrador" },
    },
  });
  return Response.json({ data: result.user }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Somente administradores podem alterar usuários." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revise os dados do usuário." }, { status: 400 });
  const { id, ...data } = parsed.data;
  const teamLevel = parsed.data.role === "admin" ? "Administrador" : parsed.data.role === "supervisor" ? "Supervisor" : "Operador";
  const saved = await prisma.user.update({
    where: { id },
    data: {
      name: data.name,
      email: data.email,
      jobTitle: data.jobTitle,
      role: data.role === "admin" ? "admin" : "user",
      teamLevel,
    },
  });
  return Response.json({ data: { id: saved.id, name: saved.name, email: saved.email, jobTitle: saved.jobTitle, teamLevel: saved.teamLevel, role: saved.role, createdAt: saved.createdAt } });
}
