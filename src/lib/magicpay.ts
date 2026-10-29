import { getSupabaseAdmin, type SagacepayOrderItem } from "@/lib/supabase-admin";
import { sendUtmifyOrder } from "@/lib/utmify";

const MAGICPAY_API_BASE = "https://api.dashboardmagicpay.com/v1";
const MAGICPAY_ID_PREFIX = "mp-";

export function getPixGateway(): "magicpay" | "umbrellapag" | "sagacepay" | null {
  const gateway = process.env["PIX_GATEWAY"]?.trim().toLowerCase();
  return gateway === "magicpay" || gateway === "umbrellapag" || gateway === "sagacepay"
    ? gateway
    : null;
}

export function isMagicpayOrderId(orderId: string): boolean {
  return orderId.startsWith(MAGICPAY_ID_PREFIX);
}

function authHeader(): string {
  const publicKey = process.env["MAGICPAY_PUBLIC_KEY"]?.trim();
  const secretKey = process.env["MAGICPAY_SECRET_KEY"]?.trim();
  if (!publicKey || !secretKey) {
    throw new Error("MAGICPAY_PUBLIC_KEY / MAGICPAY_SECRET_KEY não configuradas");
  }
  return `Basic ${btoa(`${publicKey}:${secretKey}`)}`;
}

export interface MagicpayTransaction {
  id: number | string;
  status: string;
  paidAt?: string | null;
  pix?: { qrcode?: string | null } | null;
}

function unwrapTransaction(body: unknown): MagicpayTransaction {
  const wrapped = body as { data?: MagicpayTransaction };
  return wrapped.data?.id ? wrapped.data : (body as MagicpayTransaction);
}

interface CreateMagicpayPixInput {
  externalId: string;
  amount: number;
  customer: { name: string; email: string; phone: string; document: string };
  address: {
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  items: SagacepayOrderItem[];
  host: string | undefined;
  ip: string | undefined;
}

type CreateMagicpayPixResult =
  | { ok: true; sale: { id: string; pixCode: string; pixQrCode: string } }
  | { ok: false; reason: string };

export async function createMagicpayPix(
  input: CreateMagicpayPixInput,
): Promise<CreateMagicpayPixResult> {
  let authorization: string;
  try {
    authorization = authHeader();
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      reason: "Pagamento indisponível no momento. Tente novamente em instantes.",
    };
  }

  let tx: MagicpayTransaction;
  try {
    const response = await fetch(`${MAGICPAY_API_BASE}/transactions`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        paymentMethod: "pix",
        pix: { expiresInDays: 1 },
        items: input.items.map((item) => ({
          title: item.title,
          unitPrice: Math.round(item.price * 100),
          quantity: item.quantity,
          tangible: true,
          externalRef: item.slug,
        })),
        shipping: {
          fee: 0,
          address: {
            street: input.address.street,
            streetNumber: input.address.number,
            neighborhood: input.address.neighborhood,
            city: input.address.city,
            state: input.address.state,
            zipCode: input.address.cep,
            country: "BR",
            ...(input.address.complement ? { complement: input.address.complement } : {}),
          },
        },
        customer: {
          name: input.customer.name,
          email: input.customer.email,
          ...(input.customer.phone ? { phone: input.customer.phone } : {}),
          document: {
            number: input.customer.document,
            type: input.customer.document.length === 14 ? "cnpj" : "cpf",
          },
        },
        externalRef: input.externalId,
        ...(input.host ? { postbackUrl: `https://${input.host}/api/webhooks/magicpay` } : {}),
        ...(input.ip ? { ip: input.ip } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error("MagicPay /transactions falhou:", response.status, await response.text());
      return {
        ok: false,
        reason: "Não foi possível gerar o Pix. Confira os dados e tente de novo.",
      };
    }
    tx = unwrapTransaction(await response.json());
  } catch (error) {
    console.error("MagicPay /transactions sem resposta:", error);
    return { ok: false, reason: "Erro de conexão com o gateway de pagamento." };
  }

  const pixCode = tx.pix?.qrcode;
  if (!tx.id || !pixCode) {
    console.error("MagicPay /transactions sem Pix:", tx.id, tx.status);
    return { ok: false, reason: "Não foi possível gerar o Pix. Confira os dados e tente de novo." };
  }
  return {
    ok: true,
    sale: { id: `${MAGICPAY_ID_PREFIX}${tx.id}`, pixCode, pixQrCode: pixCode },
  };
}

export async function fetchMagicpayTransaction(id: string): Promise<MagicpayTransaction | null> {
  const transactionId = id.startsWith(MAGICPAY_ID_PREFIX)
    ? id.slice(MAGICPAY_ID_PREFIX.length)
    : id;
  const response = await fetch(
    `${MAGICPAY_API_BASE}/transactions/${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: authHeader() }, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) {
    console.error("MagicPay consulta falhou:", response.status, await response.text());
    return null;
  }
  return unwrapTransaction(await response.json());
}

const REFUSED = new Set(["refused", "cancelled", "canceled"]);
const REFUNDED = new Set(["refunded", "chargeback"]);

export async function updateOrderStatus(
  orderId: string,
  from: string,
  to: string,
  utmifyStatus: "refused" | "refunded",
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: updated } = await admin
    .from("sagacepay_orders")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", from)
    .select("*")
    .single();
  if (!updated) return;
  const { buildUtmifyOrder } = await import("@/lib/order-paid");
  const row = updated as unknown as Parameters<typeof buildUtmifyOrder>[0];
  await sendUtmifyOrder(buildUtmifyOrder(row, utmifyStatus, row.items));
}

export async function applyMagicpayStatus(tx: MagicpayTransaction): Promise<string> {
  const orderId = `${MAGICPAY_ID_PREFIX}${tx.id}`;
  const status = tx.status.toLowerCase();
  if (status === "paid") {
    const { markOrderPaid } = await import("@/lib/order-paid");
    await markOrderPaid(orderId, tx.paidAt ?? undefined);
    return "paid";
  }
  if (REFUSED.has(status)) {
    await updateOrderStatus(orderId, "pending", "failed", "refused");
    return "failed";
  }
  if (REFUNDED.has(status)) {
    await updateOrderStatus(orderId, "paid", "refunded", "refunded");
    return "refunded";
  }
  return "pending";
}
