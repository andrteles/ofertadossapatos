import { createFileRoute } from "@tanstack/react-router";

import heroOxford from "@/assets/hero-oxford.jpg";
import productDerby from "@/assets/product-derby.jpg";
import productChelsea from "@/assets/product-chelsea.jpg";
import productSneaker from "@/assets/product-sneaker.jpg";
import productLoafer from "@/assets/product-loafer.jpg";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "VÉRTICE — Sapatos Masculinos" },
      {
        name: "description",
        content:
          "Sapatos sociais, casuais, botas e tênis masculinos em couro de curtume vegetal. Coleção feita à mão no Brasil.",
      },
      {
        property: "og:title",
        content: "VÉRTICE — Sapatos Masculinos",
      },
      {
        property: "og:description",
        content:
          "Sapatos masculinos cortados à mão, em couro de curtume vegetal. Feitos para durar décadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-paper text-ink font-body antialiased selection:bg-brand selection:text-white">
      {/* top hairline */}
      <div className="h-1 w-full bg-brand" />

      <Header />

      <Hero />

      <CategoryStrip />

      <FeaturedProducts />

      <CareCTA />

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
        <div className="flex items-center justify-between h-16">
          <a href="#" className="flex items-center gap-2.5">
            <span className="grid place-items-center size-7 rounded-[8px] bg-ink text-paper font-display font-semibold text-sm">
              V
            </span>
            <span className="font-display font-semibold tracking-tight text-lg">
              VÉRTICE
            </span>
            <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.2em] text-mutedwarm">
              calçado · m
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-7 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/80">
            <a href="#" className="hover:text-brand transition-colors">
              Social
            </a>
            <a href="#" className="hover:text-brand transition-colors">
              Casual
            </a>
            <a href="#" className="hover:text-brand transition-colors">
              Botas
            </a>
            <a href="#" className="hover:text-brand transition-colors">
              Tênis
            </a>
            <a href="#" className="hover:text-brand transition-colors">
              Coleção
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <button
              className="hidden sm:grid place-items-center size-9 rounded-full ring-1 ring-black/5 hover:bg-panel transition-colors"
              aria-label="Buscar"
            >
              <svg
                className="size-4 text-ink/70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <button
              className="grid place-items-center size-9 rounded-full ring-1 ring-black/5 hover:bg-panel transition-colors"
              aria-label="Sacola"
            >
              <svg
                className="size-4 text-ink/70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="M6 8h12l-1 12H7L6 8Z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </svg>
            </button>
            <span className="hidden sm:grid place-items-center size-9 rounded-full bg-ink text-paper font-mono text-[10px]">
              BR
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="blueprint border-b border-line/70">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 py-12 sm:py-16">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* copy */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-brand">
              <span className="size-1.5 rounded-full bg-brand" />
              Coleção 04 — 2025
            </div>
            <h1 className="mt-5 font-display font-semibold leading-none text-[clamp(2.6rem,7vw,5rem)] tracking-tight text-balance max-w-[18ch]">
              O social que se ajusta ao seu passo.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-mutedwarm text-pretty max-w-[46ch]">
              Sapatos masculinos cortados à mão, em couro de curtume vegetal.
              Estrutura precisa, acabamento tátil e caimento que acompanha o dia
              inteiro.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#"
                className="inline-flex items-center gap-2 rounded-[10px] bg-brand text-white text-sm font-medium py-2.5 px-4 ring-1 ring-brand hover:bg-brand/90 transition-colors"
              >
                Ver a coleção
                <svg
                  className="size-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2 rounded-[10px] bg-transparent text-ink text-sm font-medium py-2.5 px-4 ring-1 ring-ink/15 hover:bg-panel transition-colors"
              >
                Guia de tamanhos
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-line/70 pt-6">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
                  Curtume
                </dt>
                <dd className="mt-1 font-display font-semibold text-lg">
                  Vegetal
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
                  Sola
                </dt>
                <dd className="mt-1 font-display font-semibold text-lg">
                  Couro
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
                  Garantia
                </dt>
                <dd className="mt-1 font-display font-semibold text-lg">
                  2 anos
                </dd>
              </div>
            </dl>
          </div>

          {/* featured product */}
          <div className="lg:col-span-7">
            <div className="relative rounded-[16px] bg-panel ring-1 ring-black/5 p-4 sm:p-6">
              <div className="absolute -top-px left-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
                <span className="size-1.5 rounded-full bg-brand" /> Ref. VZ-041
              </div>
              <img
                src={heroOxford}
                alt="Oxford Meridian em couro marrom escuro"
                width={1200}
                height={900}
                className="w-full aspect-[4/3] object-cover outline-1 -outline-offset-1 outline-black/5 rounded-[12px]"
              />
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
                    Social
                  </p>
                  <h2 className="mt-1 font-display font-semibold text-xl tracking-tight">
                    Oxford Meridian
                  </h2>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
                    A partir de
                  </p>
                  <p className="font-display font-semibold text-2xl tracking-tight">
                    R$ 1.290
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const categories = [
  { index: "01", name: "Social", count: "12 modelos" },
  { index: "02", name: "Casual", count: "18 modelos" },
  { index: "03", name: "Botas", count: "09 modelos" },
  { index: "04", name: "Tênis", count: "15 modelos" },
];

function CategoryStrip() {
  return (
    <section className="border-b border-line/70">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-semibold text-lg tracking-tight">
            Navegar por categoria
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
            04 categorias
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <a
              key={cat.index}
              href="#"
              className="group rounded-[12px] bg-panel ring-1 ring-black/5 p-5 hover:ring-brand/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mutedwarm">
                  {cat.index}
                </span>
                <svg
                  className="size-4 text-ink/40 group-hover:text-brand transition-colors"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </div>
              <p className="mt-8 font-display font-semibold text-xl tracking-tight">
                {cat.name}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mutedwarm">
                {cat.count}
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

const products = [
  {
    image: productDerby,
    alt: "Derby Corrente em couro caramelo",
    category: "Social",
    ref: "VZ-012",
    name: "Derby Corrente",
    price: "R$ 1.150",
  },
  {
    image: productChelsea,
    alt: "Bota Chelsea Noite em couro preto",
    category: "Botas",
    ref: "VZ-027",
    name: "Chelsea Noite",
    price: "R$ 1.480",
  },
  {
    image: productSneaker,
    alt: "Tênis Court Liso em couro branco",
    category: "Tênis",
    ref: "VZ-031",
    name: "Court Liso",
    price: "R$ 890",
  },
  {
    image: productLoafer,
    alt: "Mocassim Vinho em couro borgonha",
    category: "Casual",
    ref: "VZ-019",
    name: "Mocassim Vinho",
    price: "R$ 990",
  },
];

function FeaturedProducts() {
  return (
    <section className="border-b border-line/70">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 py-12">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand">
              Seleção
            </p>
            <h2 className="mt-1 font-display font-semibold text-2xl tracking-tight">
              Peças em destaque
            </h2>
          </div>
          <a
            href="#"
            className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/70 hover:text-brand transition-colors"
          >
            Ver tudo
            <svg
              className="size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <article
              key={p.ref}
              className="group rounded-[12px] bg-panel ring-1 ring-black/5 p-3"
            >
              <img
                src={p.image}
                alt={p.alt}
                loading="lazy"
                width={1024}
                height={1024}
                className="w-full aspect-square object-cover outline-1 -outline-offset-1 outline-black/5 rounded-[12px]"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mutedwarm">
                  {p.category}
                </span>
                <span className="font-mono text-[10px] text-brand">{p.ref}</span>
              </div>
              <h3 className="mt-1 font-display font-medium text-base tracking-tight">
                {p.name}
              </h3>
              <p className="mt-1 font-display font-semibold text-base">
                {p.price}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CareCTA() {
  return (
    <section className="border-b border-line/70">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 py-12">
        <div className="rounded-[16px] bg-ink text-paper ring-1 ring-black/5 p-8 sm:p-12">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-soft/80">
                Programa de cuidado
              </p>
              <h2 className="mt-3 font-display font-semibold text-3xl sm:text-4xl tracking-tight text-balance max-w-[24ch]">
                Cuidamos do couro por você.
              </h2>
              <p className="mt-3 text-base text-paper/70 text-pretty max-w-[48ch]">
                Limpeza, hidratação e reposicionamento de sola inclusos no
                primeiro ano. Seu par, sempre como no primeiro dia.
              </p>
            </div>
            <div className="lg:col-span-5 flex lg:justify-end">
              <a
                href="#"
                className="inline-flex items-center gap-2 rounded-[10px] bg-brand text-white text-sm font-medium py-2.5 px-4 ring-1 ring-brand hover:bg-brand/90 transition-colors"
              >
                Saber mais
                <svg
                  className="size-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 py-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center size-7 rounded-[8px] bg-paper text-ink font-display font-semibold text-sm">
                V
              </span>
              <span className="font-display font-semibold text-lg tracking-tight">
                VÉRTICE
              </span>
            </div>
            <p className="mt-4 text-sm text-paper/60 text-pretty max-w-[34ch]">
              Calçadaria masculina de precisão. Feita no Brasil, pensada para
              durar décadas.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">
              Loja
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-paper/80">
              {["Social", "Casual", "Botas", "Tênis"].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="hover:text-brand-soft transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">
              Ajuda
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-paper/80">
              <li>
                <a href="#" className="hover:text-brand-soft transition-colors">
                  Guia de tamanhos
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-soft transition-colors">
                  Trocas e devoluções
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-soft transition-colors">
                  Cuidado do couro
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-brand-soft transition-colors">
                  Contato
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-paper/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
            © 2025 VÉRTICE Calçado
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
            São Paulo · Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}
