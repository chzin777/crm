import { requireModule } from "@/lib/api-auth";
import { CATALOG_SORTS, queryCatalog, type CatalogSort } from "@/lib/catalog/catalog-query";
import { catalogFacets, getCatalog } from "@/lib/catalog/vmset-catalog";

const number = (value: string | null) => {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

/**
 * Catálogo do VMSET com busca (código, referência, descrição, marca, EAN), filtros (categoria, marca, loja, preço,
 * só com estoque), ordenação e paginação no servidor. Lê do catálogo persistido no banco local (nunca espera o ERP);
 * a sincronização com o VMSET roda em segundo plano (relógio ou POST /api/produtos/sync).
 */
export async function GET(request: Request) {
  const guard = await requireModule("produtos", "chat", "pipelines", "contatos");
  if (guard.response) return guard.response;
  const params = new URL(request.url).searchParams;
  const sort = params.get("ordem") as CatalogSort | null;
  const category = params.get("categoria")?.trim() || undefined;
  try {
    const catalog = await getCatalog();
    const result = queryCatalog(catalog.products, catalog.stockOf, {
      q: params.get("q")?.slice(0, 120) ?? "",
      category,
      brand: params.get("marca")?.trim() || undefined,
      store: params.get("loja")?.trim() || undefined,
      minPrice: number(params.get("min")),
      maxPrice: number(params.get("max")),
      inStock: params.get("estoque") === "1",
      sort: CATALOG_SORTS.some((item) => item.key === sort) ? (sort as CatalogSort) : "relevancia",
      page: Number(params.get("page")) || 1,
      pageSize: Number(params.get("pageSize")) || 24,
    });
    const facets = await catalogFacets(catalog, category);
    return Response.json({ ...result, facets, productsAt: catalog.productsAt, stockAt: catalog.stockAt });
  } catch (error) {
    console.error("[produtos] catálogo indisponível:", error instanceof Error ? error.message : error);
    return Response.json({ error: error instanceof Error ? error.message : "Catálogo indisponível." }, { status: 503 });
  }
}
