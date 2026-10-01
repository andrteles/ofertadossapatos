import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { ProductCard } from "@/components/store/ProductCard";
import { useCampaignLogo } from "@/lib/campaign";
import { getPageNumbers } from "@/lib/pagination";
import {
  applyShowcaseSubstitutions,
  categories,
  filterProducts,
  type SortOption,
} from "@/lib/products";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  categoria: z.string().optional(),
  busca: z.string().optional(),
  ordenar: z.enum(["relevancia", "menor-preco", "maior-preco", "maior-desconto"]).optional(),
  pagina: z.coerce.number().int().min(1).optional(),
});

const PRODUCTS_PER_PAGE = 50;

export const Route = createFileRoute("/produtos/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Outlet" },
      {
        name: "description",
        content: "Todos os calçados e artigos de couro Ferracini em promoção.",
      },
    ],
  }),
  component: ProductsPage,
});

const sortLabels: Partial<Record<SortOption, string>> = {
  relevancia: "Relevância",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
};

function ProductsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const showCampaignLogo = useCampaignLogo();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isDefaultView =
    !search.categoria && !search.busca && (!search.ordenar || search.ordenar === "relevancia");
  const results = filterProducts(search);

  const totalPages = Math.max(1, Math.ceil(results.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(search.pagina ?? 1, totalPages);
  const vitrine =
    currentPage === 1 && isDefaultView ? applyShowcaseSubstitutions(results) : results;
  const paginatedResults = vitrine.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  );

  function updateSearch(patch: Partial<typeof search>) {
    navigate({ search: { ...search, ...patch, pagina: undefined } });
  }

  function goToPage(pagina: number) {
    navigate({ search: { ...search, pagina: pagina > 1 ? pagina : undefined } });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {search.busca ? `Resultados para "${search.busca}"` : "Todos os produtos"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{results.length} produtos encontrados</p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-4 md:gap-6">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm font-semibold md:hidden"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="size-4" />
              Filtros
            </span>
            <span className="text-xs text-muted-foreground">
              {filtersOpen ? "Ocultar" : "Mostrar"}
            </span>
          </button>

          <div className={cn("flex-col gap-6", filtersOpen ? "flex" : "hidden", "md:flex")}>
            <div>
              <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Categoria
              </p>
              <div className="flex flex-col gap-1 text-sm">
                {categories.map((categoria) => (
                  <button
                    key={categoria}
                    type="button"
                    onClick={() => updateSearch({ categoria })}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left hover:bg-secondary",
                      search.categoria === categoria && "bg-secondary font-semibold",
                    )}
                  >
                    {categoria}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div>
          <div className="mb-4 flex items-center justify-end gap-2 text-sm">
            <label htmlFor="ordenar" className="text-muted-foreground">
              Ordenar por
            </label>
            <select
              id="ordenar"
              value={search.ordenar && sortLabels[search.ordenar] ? search.ordenar : "relevancia"}
              onChange={(event) => updateSearch({ ordenar: event.target.value as SortOption })}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-base sm:text-sm"
            >
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <p className="text-lg font-semibold">Nenhum produto encontrado</p>
              <p className="text-sm text-muted-foreground">
                Tente remover alguns filtros ou buscar por outro termo.
              </p>
              <Link
                to="/produtos"
                search={{}}
                className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
              >
                Limpar filtros
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {paginatedResults.map((product) => (
                  <ProductCard key={product.slug} product={product} showBrand={showCampaignLogo} />
                ))}
              </div>

              {totalPages > 1 ? (
                <nav
                  aria-label="Paginação"
                  className="mt-8 flex flex-wrap items-center justify-center gap-1 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="rounded-md px-3 py-1.5 font-medium hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  {getPageNumbers(currentPage, totalPages).map((page, index) =>
                    page === "..." ? (
                      <span key={`ellipsis-${index}`} className="px-1.5 text-muted-foreground">
                        …
                      </span>
                    ) : (
                      <button
                        key={page}
                        type="button"
                        onClick={() => goToPage(page)}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full font-medium hover:bg-secondary",
                          page === currentPage &&
                            "border-2 border-primary font-bold text-primary hover:bg-transparent",
                        )}
                      >
                        {page}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="rounded-md px-3 py-1.5 font-medium hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
