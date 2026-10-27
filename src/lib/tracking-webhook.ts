import { createHash } from "node:crypto";

import { fetchPixelRow } from "@/lib/tracking";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** E.164 sem o "+": só dígitos, assumindo Brasil (55) quando não vier código de país. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

interface ZedyOrderPaidWebhook {
  orderId: string;
  customer: { email?: string | null; phone?: string | null } | null | undefined;
  products:
    { id: string; name: string; quantity: number; priceInCents: number }[] | null | undefined;
}

/** Evento server-to-server disparado pelo webhook da Zedy (ORDER_PAID). Diferente de
 * trackTikTokEvent: não há requisição do navegador do cliente aqui (quem chama é o servidor
 * da Zedy), então usamos email/telefone hasheados (Advanced Matching) em vez de ip/user-agent.
 *
 * Fica num arquivo separado de tracking.ts (que o navegador também importa, para
 * getPublicTrackingConfig/trackTikTokEvent) porque o import de "node:crypto" quebra o bundle
 * do cliente se ficar no mesmo módulo. */
export async function trackTikTokPurchase(order: ZedyOrderPaidWebhook): Promise<{ sent: boolean }> {
  const row = await fetchPixelRow();
  const pixelId = row?.tiktok_pixel_id;
  const accessToken = row?.tiktok_access_token;
  if (!pixelId || !accessToken) return { sent: false };

  const contents = order.products ?? [];
  const value = contents.reduce((sum, item) => sum + (item.priceInCents * item.quantity) / 100, 0);

  const user: Record<string, string> = {};
  if (order.customer?.email) user["email"] = sha256(normalizeEmail(order.customer.email));
  if (order.customer?.phone) user["phone"] = sha256(normalizePhone(order.customer.phone));

  try {
    const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify({
        event_source: "web",
        event_source_id: pixelId,
        data: [
          {
            event: "CompletePayment",
            event_time: Math.floor(Date.now() / 1000),
            event_id: `zedy-order-${order.orderId}`,
            user,
            properties: {
              currency: "BRL",
              value,
              contents: contents.map((item) => ({
                content_id: item.id,
                content_name: item.name,
                quantity: item.quantity,
                price: item.priceInCents / 100,
              })),
            },
          },
        ],
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false };
  }
}
