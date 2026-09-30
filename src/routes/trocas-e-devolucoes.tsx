import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/trocas-e-devolucoes")({
  head: () => ({
    meta: [{ title: "Trocas e devoluções — Outlet" }],
  }),
  component: TrocasEDevolucoesPage,
});

function TrocasEDevolucoesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Trocas e devoluções</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Queremos que você fique satisfeito com sua compra. Caso um produto não atenda às suas
        expectativas, você pode solicitar troca ou devolução seguindo as condições abaixo.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Direito de arrependimento
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        De acordo com o Código de Defesa do Consumidor, você tem até 7 dias corridos após o
        recebimento do produto para solicitar a devolução por arrependimento, sem necessidade de
        justificativa, com reembolso integral do valor pago.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Trocas por defeito ou tamanho
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Produtos com defeito de fabricação podem ser trocados em até 30 dias corridos após o
        recebimento. Trocas por tamanho ou preferência podem ser solicitadas em até 15 dias
        corridos, desde que o item esteja sem uso, com etiquetas originais e embalagem preservada.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Como solicitar
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Entre em contato através da nossa página de{" "}
        <Link to="/fale-conosco" className="font-medium text-primary hover:underline">
          Fale conosco
        </Link>{" "}
        informando o número do pedido e o motivo da troca ou devolução. Nossa equipe irá orientar os
        próximos passos, incluindo o envio de uma etiqueta de postagem quando aplicável.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Reembolso
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Após o recebimento e análise do produto devolvido, o reembolso é processado no mesmo método
        de pagamento utilizado na compra, em até 10 dias úteis.
      </p>
    </div>
  );
}
