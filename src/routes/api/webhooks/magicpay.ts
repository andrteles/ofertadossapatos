import { createFileRoute } from "@tanstack/react-router";

import { applyMagicpayStatus, fetchMagicpayTransaction } from "@/lib/magicpay";

interface MagicpayWebhookPayload {
  type?: string;
  objectId?: string | number;
  data?: { id?: string | number };
}

export const Route = createFileRoute("/api/webhooks/magicpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: MagicpayWebhookPayload;
        try {
          payload = (await request.json()) as MagicpayWebhookPayload;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (payload.type && payload.type !== "transaction")
          return Response.json({ received: true });
        const id = payload.objectId ?? payload.data?.id;
        if (!id) return Response.json({ received: true });

        const tx = await fetchMagicpayTransaction(String(id));
        if (!tx) return new Response("Transação não encontrada", { status: 502 });
        await applyMagicpayStatus(tx);
        return Response.json({ received: true });
      },
    },
  },
});
