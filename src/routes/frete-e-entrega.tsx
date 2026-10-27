import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/frete-e-entrega")({
  head: () => ({
    meta: [{ title: "Outlet" }],
  }),
  component: FreteEEntregaPage,
});

function FreteEEntregaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Frete e entrega</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Confira abaixo as informações sobre prazos, custos e acompanhamento das entregas dos pedidos
        realizados nesta loja.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Frete grátis
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Todos os pedidos têm frete grátis para qualquer endereço do Brasil, sem valor mínimo de
        compra.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Prazo de entrega
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        O prazo estimado de entrega varia conforme a região e é informado no momento da compra,
        junto ao valor do frete. Em geral, os pedidos são entregues entre 2 e 10 dias úteis após a
        confirmação do pagamento.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Processamento do pedido
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Após a confirmação do pagamento, o pedido é separado e despachado em até 2 dias úteis. Você
        receberá um e-mail com o código de rastreamento assim que o pacote for postado.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Acompanhamento
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Você pode acompanhar o status da entrega diretamente pelo código de rastreamento enviado por
        e-mail. Em caso de dúvidas sobre o andamento do seu pedido, entre em contato pela página de{" "}
        <Link to="/fale-conosco" className="font-medium text-primary hover:underline">
          Fale conosco
        </Link>
        .
      </p>
    </div>
  );
}
