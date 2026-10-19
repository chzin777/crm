import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { normalizePlace } from "@/lib/store-places";

const accents = Prisma.sql`'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'`;
const normalized = (column: "city" | "state" | "neighborhood") => Prisma.sql`translate(upper(btrim(${Prisma.raw(`"${column}"`)})), ${accents})`;

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const state = normalizePlace(params.get("state") ?? "").slice(0, 2);
  const city = normalizePlace(params.get("city") ?? "").slice(0, 80);
  if (type !== "cities" && type !== "neighborhoods") return Response.json({ error: "Tipo inválido." }, { status: 400 });

  const column = type === "cities" ? "city" : "neighborhood";
  const filters = [Prisma.sql`btrim(coalesce(${Prisma.raw(`"${column}"`)}, '')) <> ''`];
  if (state) filters.push(Prisma.sql`${normalized("state")} = ${state}`);
  if (type === "neighborhoods" && city) filters.push(Prisma.sql`${normalized("city")} = ${city}`);

  const names = await cached(`locations:${type}:${state}:${city}`, 3600, async () => {
    const rows = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT DISTINCT ${normalized(column)} AS name
      FROM "Contact"
      WHERE ${Prisma.join(filters, " AND ")}
      ORDER BY 1 LIMIT 3000
    `);
    return rows.map((row) => row.name);
  });
  return Response.json({ data: names });
}
