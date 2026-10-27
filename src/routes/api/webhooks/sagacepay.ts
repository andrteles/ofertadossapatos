import { timingSafeEqual, createHmac } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import {
  getSupabaseAdmin,
  type SagacepayOrderItem,
  type SagacepayOrderRow,
} from "@/lib/supabase-admin";
import { buildUtmifyOrder, markOrderPaid } from "@/lib/order-paid";
import { sendUtmifyOrder } from "@/lib/utmify";

interface SagacepayWebhookPayload {
  event: string;
  data: {
    id: string;
    status: string;
    paidAt?: string;
    [key: string]: unknown;
  };
}

const MAX_AGE_SECONDS = 300;

function isValidSignature(
  timestamp: string,
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

export const Route = createFileRoute("/api/webhooks/sagacepay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SAGACEPAY_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook não configurado", { status: 500 });

        const timestamp = request.headers.get("x-sagacepay-timestamp");
        const signature = request.headers.get("x-sagacepay-signature");
        const body = await request.text();
        if (!timestamp || !signature) return new Response("Unauthorized", { status: 401 });

        const age = Math.abs(Date.now() / 1000 - Number(timestamp));
        if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) {
          return new Response("Unauthorized", { status: 401 });
        }
        if (!isValidSignature(timestamp, body, signature, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const payload = JSON.parse(body) as SagacepayWebhookPayload;

        const admin = getSupabaseAdmin();
        if (!admin) return new Response("Banco não configurado", { status: 500 });

        if (payload.event === "sale.paid") {
          await markOrderPaid(payload.data.id, payload.data.paidAt);
        } else if (payload.event === "sale.failed" || payload.event === "sale.expired") {
          const { data: failed } = await admin
            .from("sagacepay_orders")
            .update({ status: payload.data.status, updated_at: new Date().toISOString() })
            .eq("id", payload.data.id)
            .eq("status", "pending")
            .select("*")
            .single();
          if (failed) {
            await sendUtmifyOrder(
              buildUtmifyOrder(
                failed as unknown as SagacepayOrderRow,
                "refused",
                (failed as unknown as SagacepayOrderRow).items,
              ),
            );
          }
        }

        return Response.json({ received: true });
      },
    },
  },
});
