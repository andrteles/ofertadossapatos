import { createFileRoute } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";
import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sola & Couro — Sapatos masculinos em couro" },
      { name: "description", content: "Oxfords, loafers, botas e tênis masculinos feitos à mão em couro legítimo." },
      { property: "og:title", content: "Sola & Couro — Sapatos masculinos" },
      { property: "og:description", content: "Sapatos masculinos feitos à mão em couro legítimo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const products = [
  { img: p1, name: "Chelsea Noir", cat: "Botas", price: "R$ 689" },
  { img: p2, name: "Loafer Caramelo", cat: "Mocassins", price: "R$ 549" },
  { img: p3, name: "Court Branco", cat: "Tênis", price: "R$ 459" },
];

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <span className="font-display text-2xl tracking-tight">Sola &amp; Couro</span>
        <nav className="hidden gap-8 text-sm uppercase tracking-widest md:flex">
          <a href="#colecao">Coleção</a>
          <a href="#historia">Ateliê</a>
          <a href="#contato">Contato</a>
        </nav>
        <span className="text-sm">Sacola (0)</span>
      </header>

      <section className="relative mx-4 overflow-hidden rounded-sm bg-ink text-ink-foreground md:mx-12">
        <img src={hero} alt="Oxford de couro marrom" width={1600} height={1008} className="h-[78vh] w-full object-cover opacity-80" />
        <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-16">
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-cognac">Coleção Outono 2026</p>
          <h1 className="max-w-2xl text-5xl leading-[1.05] md:text-7xl">Feito para durar a vida inteira.</h1>
          <a href="#colecao" className="mt-8 w-fit border border-ink-foreground px-8 py-3 text-sm uppercase tracking-widest transition hover:bg-ink-foreground hover:text-ink">
            Ver coleção
          </a>
        </div>
      </section>

      <section id="colecao" className="px-6 py-24 md:px-12">
        <div className="mb-12 flex items-end justify-between">
          <h2 className="text-4xl md:text-5xl">Mais desejados</h2>
          <span className="text-sm uppercase tracking-widest text-muted-foreground">Ver todos →</span>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {products.map((p) => (
            <article key={p.name} className="group cursor-pointer">
              <div className="overflow-hidden bg-card">
                <img src={p.img} alt={p.name} loading="lazy" width={800} height={1008} className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-105" />
              </div>
              <div className="mt-4 flex justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{p.cat}</p>
                  <h3 className="text-xl">{p.name}</h3>
                </div>
                <p className="font-medium">{p.price}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="historia" className="grid gap-12 bg-ink px-6 py-24 text-ink-foreground md:grid-cols-2 md:px-12">
        <h2 className="text-4xl leading-tight md:text-5xl">Couro legítimo, costura à mão, desde 1987.</h2>
        <div className="space-y-6 text-ink-foreground/75">
          <p>Cada par passa por mais de 120 etapas no nosso ateliê em Franca, a capital brasileira do calçado.</p>
          <div className="grid grid-cols-3 gap-6 pt-6">
            {[["120+", "etapas"], ["2 anos", "de garantia"], ["Frete", "grátis"]].map(([a, b]) => (
              <div key={b}>
                <p className="font-display text-3xl text-cognac">{a}</p>
                <p className="text-sm">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer id="contato" className="flex flex-col justify-between gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:px-12">
        <span className="font-display text-lg text-foreground">Sola &amp; Couro</span>
        <span>contato@solaecouro.com.br · Franca, SP</span>
      </footer>
    </div>
  );
}
