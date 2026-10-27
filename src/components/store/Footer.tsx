import { Link } from "@tanstack/react-router";

const bandeiras = [
  { nome: "Visa", className: "bg-white text-[#1A1F71] italic" },
  { nome: "Elo", className: "bg-white text-foreground" },
  { nome: "Amex", className: "bg-[#006FCF] text-white" },
  { nome: "Hipercard", className: "bg-[#B3131B] text-white" },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-14 md:grid-cols-12">
        <div className="md:col-span-4">
          <p className="max-w-[34ch] text-sm text-muted-foreground">
            Calçados e artigos de couro em outlet, com preços reduzidos.
          </p>
        </div>

        <div className="md:col-span-2 md:col-start-9">
          <p className="mb-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            Ajuda
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                to="/trocas-e-devolucoes"
                className="text-foreground transition-colors hover:text-primary"
              >
                Trocas e devoluções
              </Link>
            </li>
            <li>
              <Link
                to="/frete-e-entrega"
                className="text-foreground transition-colors hover:text-primary"
              >
                Frete e entrega
              </Link>
            </li>
            <li>
              <Link
                to="/politica-de-privacidade"
                className="text-foreground transition-colors hover:text-primary"
              >
                Política de privacidade
              </Link>
            </li>
            <li>
              <Link
                to="/fale-conosco"
                className="text-foreground transition-colors hover:text-primary"
              >
                Fale conosco
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-5 text-xs text-muted-foreground md:flex-row">
          <p>© 2026 - Arte & Couro Calçados LTDA</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <p>Pagamento no Pix ou em até 12x no cartão</p>
            <div className="flex items-center gap-1.5">
              <span
                aria-label="Pix"
                className="flex h-5 w-8 items-center justify-center rounded-[3px] border border-border bg-[#32BCAD]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <path d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156" />
                </svg>
              </span>
              <span
                aria-label="Mastercard"
                className="flex h-5 w-8 items-center justify-center rounded-[3px] border border-border bg-white"
              >
                <svg width="18" height="11" viewBox="0 0 18 11" aria-hidden="true">
                  <circle cx="6" cy="5.5" r="5.5" fill="#EB001B" />
                  <circle cx="12" cy="5.5" r="5.5" fill="#F79E1B" className="mix-blend-multiply" />
                </svg>
              </span>
              {bandeiras.map((bandeira) => (
                <span
                  key={bandeira.nome}
                  className={`flex h-5 items-center justify-center rounded-[3px] border border-border px-1.5 text-[9px] font-extrabold tracking-tight ${bandeira.className}`}
                >
                  {bandeira.nome}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
