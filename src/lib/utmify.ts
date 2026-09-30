import { fetchPixelRow } from "@/lib/tracking";
import type { TrackingParameters } from "@/lib/utm";

const UTMIFY_ORDERS_URL = "https://api.utmify.com.br/api-credentials/orders";

export type UtmifyStatus = "waiting_payment" | "paid" | "refused" | "refunded";

export interface UtmifyOrderInput {
  orderId: string;
  status: UtmifyStatus;
  createdAt: Date;
  approvedAt?: Date | null;
  customer: { name: string; email: string | null; phone: string | null; document: string };
  products: { id: string; name: string; quantity: number; priceInCents: number }[];
  trackingParameters: TrackingParameters | null;
}

/** A Utmify exige datas em UTC no formato "YYYY-MM-DD HH:MM:SS". */
function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/** Envia (ou atualiza, pelo mesmo orderId) a venda na Utmify. Nunca lança: falha aqui não pode
 * atrapalhar o Pix nem o 2xx do webhook. Precisa do token salvo em /pixel. */
export async function sendUtmifyOrder(order: UtmifyOrderInput): Promise<{ sent: boolean }> {
  try {
    const token = (await fetchPixelRow())?.utmify_api_token;
    if (!token) return { sent: false };

    const totalPriceInCents = order.products.reduce(
      (sum, item) => sum + item.priceInCents * item.quantity,
      0,
    );
    const tracking = order.trackingParameters ?? {};

    const response = await fetch(UTMIFY_ORDERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": token },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        orderId: order.orderId,
        platform: "Outlet",
        paymentMethod: "pix",
        status: order.status,
        createdAt: formatDate(order.createdAt),
        approvedDate: order.approvedAt ? formatDate(order.approvedAt) : null,
        refundedAt: null,
        customer: {
          name: order.customer.name,
          email: order.customer.email ?? "",
          phone: order.customer.phone,
          document: order.customer.document,
          country: "BR",
        },
        products: order.products.map((item) => ({
          id: item.id,
          name: item.name,
          planId: null,
          planName: null,
          quantity: item.quantity,
          priceInCents: item.priceInCents,
        })),
        trackingParameters: {
          src: tracking.src ?? null,
          sck: tracking.sck ?? null,
          utm_source: tracking.utm_source ?? null,
          utm_campaign: tracking.utm_campaign ?? null,
          utm_medium: tracking.utm_medium ?? null,
          utm_content: tracking.utm_content ?? null,
          utm_term: tracking.utm_term ?? null,
        },
        commission: {
          totalPriceInCents,
          gatewayFeeInCents: 0,
          userCommissionInCents: totalPriceInCents,
        },
        isTest: false,
      }),
    });
    if (!response.ok) {
      console.error("Utmify falhou:", response.status, await response.text());
    }
    return { sent: response.ok };
  } catch (error) {
    console.error("Utmify sem resposta:", error);
    return { sent: false };
  }
}
