import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/fale-conosco")({
  head: () => ({
    meta: [{ title: "Outlet" }],
  }),
  component: FaleConoscoPage,
});

function FaleConoscoPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    toast.success("Mensagem enviada", {
      description: "Nossa equipe irá responder em breve pelo e-mail informado.",
    });
    setNome("");
    setEmail("");
    setMensagem("");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Fale conosco</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Tem alguma dúvida, sugestão ou precisa de ajuda com um pedido? Preencha o formulário abaixo
        e nossa equipe de atendimento entrará em contato o mais breve possível.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nome" className="text-sm font-medium text-foreground">
            Nome
          </label>
          <input
            id="nome"
            type="text"
            required
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-1 sm:text-sm focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-1 sm:text-sm focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mensagem" className="text-sm font-medium text-foreground">
            Mensagem
          </label>
          <textarea
            id="mensagem"
            required
            rows={5}
            value={mensagem}
            onChange={(event) => setMensagem(event.target.value)}
            className="resize-none rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-1 sm:text-sm focus-visible:ring-ring"
          />
        </div>

        <Button type="submit" size="lg" className="mt-2 w-full font-bold sm:w-fit">
          Enviar mensagem
        </Button>
      </form>
    </div>
  );
}
