import { updateOrderStatus } from "@/lib/magicpay";
import type { SagacepayOrderItem } from "@/lib/supabase-admin";

const UMBRELLAPAG_API_BASE = "https://api-gateway.umbrellapag.com/api";
const UMBRELLAPAG_ID_PREFIX = "up-";
const USER_AGENT = "UMBRELLAB2B/1.0";

export function isUmbrellapagOrderId(orderId: string): boolean {
  return orderId.startsWith(UMBRELLAPAG_ID_PREFIX);
}

function headers(): Record<string, string> {
  const apiKey = process.env["UMBRELLAPAG_API_KEY"]?.trim();
  if (!apiKey) throw new Error("UMBRELLAPAG_API_KEY não configurada");
  return { "x-api-key": apiKey, "User-Agent": USER_AGENT };
}

export interface UmbrellapagTransaction {
  id: string;
  status: string;
  paidAt?: string | null;
  qrCode?: string | null;
}

function unwrapTransaction(body: unknown): UmbrellapagTransaction {
  const wrapped = body as { data?: UmbrellapagTransaction };
  return wrapped.data?.id ? wrapped.data : (body as UmbrellapagTransaction);
}

interface CreateUmbrellapagPixInput {
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

type CreateUmbrellapagPixResult =
  | { ok: true; sale: { id: string; pixCode: string; pixQrCode: string } }
  | { ok: false; reason: string };

export async function createUmbrellapagPix(
  input: CreateUmbrellapagPixInput,
): Promise<CreateUmbrellapagPixResult> {
  let requestHeaders: Record<string, string>;
  try {
    requestHeaders = headers();
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      reason: "Pagamento indisponível no momento. Tente novamente em instantes.",
    };
  }

  const address = {
    street: input.address.street,
    streetNumber: input.address.number,
    neighborhood: input.address.neighborhood,
    city: input.address.city,
    state: input.address.state,
    zipCode: input.address.cep,
    country: "BR",
    ...(input.address.complement ? { complement: input.address.complement } : {}),
  };

  let tx: UmbrellapagTransaction;
  try {
    const response = await fetch(`${UMBRELLAPAG_API_BASE}/user/transactions`, {
      method: "POST",
      headers: { ...requestHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        currency: "BRL",
        paymentMethod: "PIX",
        installments: 1,
        pix: { expiresInDays: 1 },
        items: input.items.map((item) => ({
          title: item.title,
          unitPrice: Math.round(item.price * 100),
          quantity: item.quantity,
          tangible: true,
          externalRef: item.slug,
        })),
        customer: {
          name: input.customer.name,
          email: input.customer.email,
          ...(input.customer.phone ? { phone: input.customer.phone } : {}),
          document: {
            number: input.customer.document,
            type: input.customer.document.length === 14 ? "CNPJ" : "CPF",
          },
          address,
        },
        shipping: { fee: 0, address },
        metadata: JSON.stringify({ externalId: input.externalId }),
        traceable: false,
        ...(input.host ? { postbackUrl: `https://${input.host}/api/webhooks/umbrellapag` } : {}),
        ...(input.ip ? { ip: input.ip } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error("UmbrellaPag /transactions falhou:", response.status, await response.text());
      return {
        ok: false,
        reason: "Não foi possível gerar o Pix. Confira os dados e tente de novo.",
      };
    }
    tx = unwrapTransaction(await response.json());
  } catch (error) {
    console.error("UmbrellaPag /transactions sem resposta:", error);
    return { ok: false, reason: "Erro de conexão com o gateway de pagamento." };
  }

  const pixCode = tx.qrCode;
  if (!tx.id || !pixCode) {
    console.error("UmbrellaPag /transactions sem Pix:", tx.id, tx.status);
    return { ok: false, reason: "Não foi possível gerar o Pix. Confira os dados e tente de novo." };
  }
  return {
    ok: true,
    sale: { id: `${UMBRELLAPAG_ID_PREFIX}${tx.id}`, pixCode, pixQrCode: pixCode },
  };
}

export async function fetchUmbrellapagTransaction(
  id: string,
): Promise<UmbrellapagTransaction | null> {
  const transactionId = id.startsWith(UMBRELLAPAG_ID_PREFIX)
    ? id.slice(UMBRELLAPAG_ID_PREFIX.length)
    : id;
  const response = await fetch(
    `${UMBRELLAPAG_API_BASE}/user/transactions/${encodeURIComponent(transactionId)}`,
    { headers: headers(), signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) {
    console.error("UmbrellaPag consulta falhou:", response.status, await response.text());
    return null;
  }
  return unwrapTransaction(await response.json());
}

const REFUSED = new Set(["refused", "cancelled", "canceled", "expired"]);
const REFUNDED = new Set(["refunded", "chargeback", "chargedback"]);

export async function applyUmbrellapagStatus(tx: UmbrellapagTransaction): Promise<string> {
  const orderId = `${UMBRELLAPAG_ID_PREFIX}${tx.id}`;
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
