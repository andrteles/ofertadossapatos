import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [{ title: "Outlet" }],
  }),
  component: PoliticaDePrivacidadePage,
});

function PoliticaDePrivacidadePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Política de privacidade</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Esta política explica como as informações fornecidas por você são coletadas, utilizadas e
        protegidas ao navegar e realizar compras neste site.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Quais dados coletamos
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Coletamos informações fornecidas diretamente por você, como nome, e-mail, endereço e dados
        de pagamento, necessárias para processar pedidos e entrar em contato quando preciso. Também
        coletamos dados de navegação, como páginas visitadas e produtos visualizados, para melhorar
        sua experiência de compra.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Como usamos seus dados
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Utilizamos suas informações para processar e entregar pedidos, prestar atendimento, prevenir
        fraudes e enviar comunicações relacionadas às suas compras. Seus dados não são vendidos a
        terceiros.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Cookies
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Utilizamos cookies para lembrar itens no carrinho, preferências de navegação e melhorar o
        desempenho do site. Você pode desativar os cookies nas configurações do seu navegador,
        embora isso possa afetar algumas funcionalidades da loja.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Compartilhamento de dados
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Compartilhamos dados apenas com parceiros essenciais à operação, como serviços de pagamento
        e transportadoras, exclusivamente para viabilizar a entrega dos pedidos.
      </p>

      <h2 className="mt-8 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        Seus direitos
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Você pode solicitar a qualquer momento a atualização, correção ou exclusão dos seus dados
        pessoais entrando em contato pela página de{" "}
        <Link to="/fale-conosco" className="font-medium text-primary hover:underline">
          Fale conosco
        </Link>
        .
      </p>
    </div>
  );
}
