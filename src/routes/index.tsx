import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { ProductCard } from "@/components/store/ProductCard";
import { useCampaignLogo } from "@/lib/campaign";
import { getPageNumbers } from "@/lib/pagination";
import { applyShowcaseSubstitutions, filterProducts } from "@/lib/products";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  pagina: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Outlet" },
      {
        name: "description",
        content: "Calçados e artigos de couro Ferracini com preços de outlet.",
      },
    ],
  }),
  component: Home,
});

const PAGE_SIZE = 20;

const filtros = [{ rotulo: "Outlet", search: {} }];

function Home() {
  const search = Route.useSearch();
  const showCampaignLogo = useCampaignLogo();
  const all = filterProducts({});
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(Math.max(search.pagina ?? 1, 1), totalPages);
  const vitrine = (page === 1 ? applyShowcaseSubstitutions(all) : all).slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filtros.map((filtro) => (
          <Link
            key={filtro.rotulo}
            to="/produtos"
            search={filtro.search}
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {filtro.rotulo}
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        {vitrine.map((product) => (
          <ProductCard key={product.slug} product={product} showBrand={showCampaignLogo} />
        ))}
      </div>

      {totalPages > 1 ? (
        <nav
          aria-label="Paginação"
          className="mt-8 flex flex-wrap items-center justify-center gap-1 text-sm"
        >
          <Link
            to="/"
            search={{ pagina: page - 1 }}
            aria-disabled={page <= 1}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-secondary",
            )}
          >
            Anterior
          </Link>
          {getPageNumbers(page, totalPages).map((p, index) =>
            p === "..." ? (
              <span key={`ellipsis-${index}`} className="px-1.5 text-muted-foreground">
                …
              </span>
            ) : (
              <Link
                key={p}
                to="/"
                search={{ pagina: p }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full font-medium hover:bg-secondary",
                  p === page &&
                    "border-2 border-primary font-bold text-primary hover:bg-transparent",
                )}
              >
                {p}
              </Link>
            ),
          )}
          <Link
            to="/"
            search={{ pagina: page + 1 }}
            aria-disabled={page >= totalPages}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-secondary",
            )}
          >
            Próxima
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
