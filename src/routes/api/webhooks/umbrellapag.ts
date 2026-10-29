import { createFileRoute } from "@tanstack/react-router";

import { applyUmbrellapagStatus, fetchUmbrellapagTransaction } from "@/lib/umbrellapag";

interface UmbrellapagWebhookPayload {
  objectId?: string;
  data?: { id?: string; type?: string };
}

export const Route = createFileRoute("/api/webhooks/umbrellapag")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: UmbrellapagWebhookPayload;
        try {
          payload = (await request.json()) as UmbrellapagWebhookPayload;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (payload.data?.type && payload.data.type !== "transaction")
          return Response.json({ received: true });
        const id = payload.objectId ?? payload.data?.id;
        if (!id) return Response.json({ received: true });

        const tx = await fetchUmbrellapagTransaction(String(id));
        if (!tx) return new Response("Transação não encontrada", { status: 502 });
        await applyUmbrellapagStatus(tx);
        return Response.json({ received: true });
      },
    },
  },
});
