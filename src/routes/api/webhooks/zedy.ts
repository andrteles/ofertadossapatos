import { createFileRoute } from "@tanstack/react-router";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { trackTikTokPurchase } from "@/lib/tracking-webhook";

interface ZedyWebhookPayload {
  eventType: string;
  orderId: string;
  [key: string]: unknown;
}

export const Route = createFileRoute("/api/webhooks/zedy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${process.env["ZEDY_WEBHOOK_SECRET"]}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const payload = (await request.json()) as ZedyWebhookPayload;

        const admin = getSupabaseAdmin();
        if (!admin) return new Response("Banco não configurado", { status: 500 });

        const { error: insertError } = await admin.from("zedy_webhook_events").insert({
          order_id: payload.orderId,
          event_type: payload.eventType,
          payload: payload as unknown,
        });

        // Código 23505 = violação de chave primária: já processamos esse evento (reenvio da Zedy).
        const alreadyProcessed = insertError?.code === "23505";
        if (insertError && !alreadyProcessed) {
          console.error("Erro ao gravar webhook da Zedy:", insertError);
        }

        if (!alreadyProcessed && payload.eventType === "ORDER_PAID") {
          try {
            await trackTikTokPurchase({
              orderId: payload.orderId,
              customer: payload["customer"] as { email?: string; phone?: string } | undefined,
              products: payload["products"] as
                | { id: string; name: string; quantity: number; priceInCents: number }[]
                | undefined,
            });
          } catch {
            // Nunca deixa uma falha no TikTok atrasar/quebrar o 2xx pra Zedy.
          }
        }

        return Response.json({ received: true });
      },
    },
  },
});
