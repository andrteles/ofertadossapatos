import {
  getSupabaseAdmin,
  type SagacepayOrderItem,
  type SagacepayOrderRow,
} from "@/lib/supabase-admin";
import { trackTikTokPurchase } from "@/lib/tracking-webhook";
import { sendUtmifyOrder, type UtmifyOrderInput } from "@/lib/utmify";

/** Só servidor (importa node:crypto via tracking-webhook): não importar de código do navegador. */
export function buildUtmifyOrder(
  row: SagacepayOrderRow,
  status: UtmifyOrderInput["status"],
  items: SagacepayOrderItem[],
): UtmifyOrderInput {
  return {
    orderId: row.external_id,
    status,
    createdAt: new Date(row.created_at),
    approvedAt:
      status === "paid" || status === "refunded" ? new Date(row.paid_at ?? Date.now()) : null,
    refundedAt: status === "refunded" ? new Date() : null,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      document: row.customer_document,
    },
    products: items.map((item) => ({
      id: item.slug,
      name: item.title,
      quantity: item.quantity,
      priceInCents: Math.round(item.price * 100),
    })),
    trackingParameters: row.tracking_parameters,
  };
}

/** Marca o pedido como pago e dispara Utmify + TikTok. Idempotente: só age se ainda estava
 * pending, então o webhook e a consulta direta à SagacePay podem chamar sem duplicar eventos. */
export async function markOrderPaid(saleId: string, paidAt?: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  const { data: updated, error } = await admin
    .from("sagacepay_orders")
    .update({
      status: "paid",
      paid_at: paidAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error || !updated) return false;

  const row = updated as unknown as SagacepayOrderRow;
  await sendUtmifyOrder(buildUtmifyOrder(row, "paid", row.items));
  try {
    await trackTikTokPurchase({
      orderId: row.external_id,
      customer: { email: row.customer_email, phone: row.customer_phone },
      products: row.items.map((item) => ({
        id: item.slug,
        name: item.title,
        quantity: item.quantity,
        priceInCents: Math.round(item.price * 100),
      })),
    });
  } catch {
    // Nunca deixa uma falha no TikTok atrasar/quebrar o 2xx pra SagacePay.
  }
  return true;
}
