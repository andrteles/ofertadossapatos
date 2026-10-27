import { createFileRoute } from "@tanstack/react-router";

import { applyHypercashStatus, fetchHypercashTransaction } from "@/lib/hypercash";

interface HypercashWebhookPayload {
  type?: string;
  objectId?: string;
  data?: { id?: string };
}

/** A HyperCash não assina o postback: o corpo só serve pra saber qual transação mudou. O status
 * real é sempre buscado na API com a chave secreta antes de mexer no pedido. */
export const Route = createFileRoute("/api/webhooks/hypercash")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: HypercashWebhookPayload;
        try {
          payload = (await request.json()) as HypercashWebhookPayload;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        const id = payload.objectId ?? payload.data?.id;
        if (!id) return Response.json({ received: true });

        const tx = await fetchHypercashTransaction(id);
        if (!tx) return new Response("Transação não encontrada", { status: 502 });
        await applyHypercashStatus(tx);
        return Response.json({ received: true });
      },
    },
  },
});
