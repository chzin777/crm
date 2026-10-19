import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { normalizePlace } from "@/lib/store-places";

export async function GET(request: Request) {
  const user = await requireApiSession();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = normalizePlace(params.get("q") ?? "").slice(0, 80);
  const city = normalizePlace(params.get("city") ?? "").slice(0, 80);
  if (query.length < 2) return Response.json({ data: [] });

  const accents = Prisma.sql`'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'`;
  const cityFilter = city
    ? Prisma.sql`AND translate(upper(btrim(city)), ${accents}) = ${city}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ name: string; n: bigint }>>(Prisma.sql`
    SELECT translate(upper(btrim(neighborhood)), ${accents}) AS name, count(*) AS n
    FROM "Contact"
    WHERE neighborhood IS NOT NULL AND translate(upper(btrim(neighborhood)), ${accents}) LIKE ${`%${query.replace(/[%_\\]/g, "\\$&")}%`}
    ${cityFilter}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 20
  `);
  return Response.json({ data: rows.map((row) => ({ name: row.name, contacts: Number(row.n) })) });
}
