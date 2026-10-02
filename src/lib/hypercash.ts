import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

import { getProductBySlug } from "@/lib/products";
import {
  isValidCep,
  isValidDocument,
  sanitizeTrackingParameters,
  type CreateCheckoutOrderInput,
} from "@/lib/sagacepay";
import { getSupabaseAdmin, type SagacepayOrderItem } from "@/lib/supabase-admin";
import { sendUtmifyOrder } from "@/lib/utmify";

const HYPERCASH_API_BASE = "https://api.hypercashbrasil.com.br/api";

/** Mesmo fator mostrado nas opções de parcelamento do checkout (2x em diante). */
export const INSTALLMENT_INTEREST = 1.06;

function getSecretKey(): string {
  const key = process.env["HYPERCASH_SECRET_KEY"]?.trim();
  if (!key) throw new Error("HYPERCASH_SECRET_KEY não configurada");
  return key;
}

function authHeader(secretKey: string): string {
  return `Basic ${btoa(`x:${secretKey}`)}`;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export interface HypercashTransaction {
  id: string;
  status: string;
  amount: number;
  installments?: number;
  refusedReason?: string | null;
  paidAt?: string | null;
  card?: { brand?: string | null; lastDigits?: string | null } | null;
}

/** Consulta a transação direto na HyperCash. O webhook não tem assinatura, então o status
 * só é considerado verdadeiro depois de confirmado aqui com a chave secreta. */
export async function fetchHypercashTransaction(id: string): Promise<HypercashTransaction | null> {
  const response = await fetch(
    `${HYPERCASH_API_BASE}/user/transactions/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: authHeader(getSecretKey()) },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) {
    console.error("HyperCash consulta falhou:", response.status, await response.text());
    return null;
  }
  const body = (await response.json()) as { data?: HypercashTransaction };
  return body.data ?? null;
}

const APPROVED = new Set(["PAID", "AUTHORIZED"]);
const REFUSED = new Set(["REFUSED", "CANCELED"]);

/** Aplica o status da HyperCash no pedido local (idempotente: pago/recusado só mexem em pedido
 * pending; estorno só mexe em pedido pago). */
export async function applyHypercashStatus(tx: HypercashTransaction): Promise<string> {
  const status = tx.status.toUpperCase();
  if (status === "PAID") {
    const { markOrderPaid } = await import("@/lib/order-paid");
    await markOrderPaid(tx.id, tx.paidAt ?? undefined);
    return "paid";
  }
  if (REFUSED.has(status)) {
    const admin = getSupabaseAdmin();
    if (admin) {
      const { data: failed } = await admin
        .from("sagacepay_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", tx.id)
        .eq("status", "pending")
        .select("*")
        .single();
      if (failed) {
        const { buildUtmifyOrder } = await import("@/lib/order-paid");
        const row = failed as unknown as Parameters<typeof buildUtmifyOrder>[0];
        await sendUtmifyOrder(buildUtmifyOrder(row, "refused", row.items));
      }
    }
    return "failed";
  }
  if (status === "REFUNDED") {
    const admin = getSupabaseAdmin();
    if (admin) {
      const { data: refunded } = await admin
        .from("sagacepay_orders")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", tx.id)
        .eq("status", "paid")
        .select("*")
        .single();
      if (refunded) {
        const { buildUtmifyOrder } = await import("@/lib/order-paid");
        const row = refunded as unknown as Parameters<typeof buildUtmifyOrder>[0];
        await sendUtmifyOrder(buildUtmifyOrder(row, "refunded", row.items));
      }
    }
    return "refunded";
  }
  return "pending";
}

/** Só a chave pública (pk_) vai pro navegador, para o security.js tokenizar o cartão. */
export const getCardPublicKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publicKey: string | null }> => ({
    publicKey: process.env["HYPERCASH_PUBLIC_KEY"]?.trim() || null,
  }),
);

type CreateCardOrderInput = CreateCheckoutOrderInput & {
  cardToken: string;
  installments: number;
};

type CreateCardOrderResult =
  | {
      ok: true;
      orderId: string;
      status: "paid" | "pending";
      amount: number;
      brand: string | null;
      lastDigits: string | null;
    }
  /** refused: o cartão foi recusado (a gaveta mostra a mensagem de recusa da referência). */
  | { ok: false; reason: string; refused?: true };

/** Texto do erro devolvido pela HyperCash (message pode ser string ou lista de validações). */
function apiErrorText(body: { message?: unknown } | null): string {
  const message = body?.message;
  if (Array.isArray(message)) return message.join("; ");
  if (typeof message === "string" && message) return message;
  return body ? JSON.stringify(body).slice(0, 500) : "sem resposta";
}

function refusedMessage(reason: string | null | undefined): string {
  const base = "Pagamento recusado pelo emissor do cartão.";
  return reason ? `${base} ${reason}` : `${base} Confira os dados ou use outro cartão.`;
}

/** Cobra o cartão já tokenizado no navegador (o número nunca passa pelo nosso servidor) e
 * grava o pedido em sagacepay_orders, igual ao Pix, pra aparecer em /pedidos e no webhook.
 * Preço sempre recalculado a partir do catálogo local. */
export const createCardOrder = createServerFn({ method: "POST" })
  .validator((input: CreateCardOrderInput) => input)
  .handler(async ({ data }): Promise<CreateCardOrderResult> => {
    if (data.items.length === 0) return { ok: false, reason: "Sacola vazia." };
    if (!data.cardToken) return { ok: false, reason: "Não foi possível validar o cartão." };
    if (!data.customer.name.trim()) return { ok: false, reason: "Informe seu nome completo." };
    const installments = Math.trunc(data.installments);
    if (!(installments >= 1 && installments <= 12)) {
      return { ok: false, reason: "Parcelamento inválido." };
    }

    const document = onlyDigits(data.customer.document);
    if (!isValidDocument(document)) return { ok: false, reason: "CPF/CNPJ inválido." };

    const cep = onlyDigits(data.address.cep);
    if (!isValidCep(cep)) return { ok: false, reason: "CEP inválido." };
    if (
      !data.address.street.trim() ||
      !data.address.number.trim() ||
      !data.address.neighborhood.trim() ||
      !data.address.city.trim()
    ) {
      return { ok: false, reason: "Preencha o endereço completo." };
    }
    const state = data.address.state.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) return { ok: false, reason: "UF inválida." };

    let subtotal = 0;
    const items: SagacepayOrderItem[] = [];
    for (const item of data.items) {
      const product = getProductBySlug(item.slug);
      if (!product || item.quantity <= 0) return { ok: false, reason: "Item inválido na sacola." };
      subtotal += product.price * item.quantity;
      items.push({
        slug: product.slug,
        title: product.title,
        size: item.size,
        quantity: item.quantity,
        price: product.price,
      });
    }

    const subtotalCents = items.reduce(
      (sum, item) => sum + Math.round(item.price * 100) * item.quantity,
      0,
    );
    const amountCents =
      installments === 1 ? subtotalCents : Math.round(subtotal * INSTALLMENT_INTEREST * 100);
    const interestCents = amountCents - subtotalCents;
    const amount = amountCents / 100;

    let secretKey: string;
    try {
      secretKey = getSecretKey();
    } catch (error) {
      console.error(error);
      return { ok: false, reason: "Pagamento com cartão indisponível no momento. Use o Pix." };
    }

    const externalId = crypto.randomUUID();
    const name = data.customer.name.trim();
    const email = data.customer.email.trim();
    const phone = onlyDigits(data.customer.phone);
    const address = {
      street: data.address.street.trim(),
      streetNumber: data.address.number.trim(),
      ...(data.address.complement.trim() ? { complement: data.address.complement.trim() } : {}),
      zipCode: cep,
      neighborhood: data.address.neighborhood.trim(),
      city: data.address.city.trim(),
      state,
      country: "BR",
    };
    const host = getRequestHeader("x-forwarded-host") || getRequestHeader("host");
    const ip = getRequestHeader("cf-connecting-ip") || getRequestIP({ xForwardedFor: true });

    const trackingParameters = sanitizeTrackingParameters(data.trackingParameters);
    const createdAt = new Date();
    async function saveCardOrder(input: {
      id: string;
      status: "pending" | "failed";
      failureReason: string | null;
      upsell?: { externalId: string; items: SagacepayOrderItem[]; amount: number };
    }) {
      const admin = getSupabaseAdmin();
      if (!admin) return;
      const row = {
        id: input.id,
        external_id: input.upsell?.externalId ?? externalId,
        status: input.status,
        amount: input.upsell?.amount ?? amount,
        customer_name: name,
        customer_email: email || null,
        customer_phone: phone || null,
        customer_document: document,
        address_cep: cep,
        address_street: address.street,
        address_number: address.streetNumber,
        address_complement: data.address.complement.trim() || null,
        address_neighborhood: address.neighborhood,
        address_city: address.city,
        address_state: state,
        items: input.upsell?.items ?? items,
        pix_code: null,
        pix_qr_code: null,
      };
      // Colunas opcionais (migrations que podem não ter sido aplicadas): tenta com elas, depois sem.
      let { error } = await admin.from("sagacepay_orders").insert({
        ...row,
        tracking_parameters: trackingParameters,
        ...(input.failureReason ? { failure_reason: input.failureReason } : {}),
      });
      if (error) {
        ({ error } = await admin
          .from("sagacepay_orders")
          .insert({ ...row, tracking_parameters: trackingParameters }));
      }
      if (error) ({ error } = await admin.from("sagacepay_orders").insert(row));
      if (error) console.error("Erro ao gravar pedido de cartão:", error);
    }

    const hypercashCustomer = {
      name,
      email,
      phone,
      document: { number: document, type: document.length === 14 ? "CNPJ" : "CPF" },
      address,
    };

    let tx: HypercashTransaction;
    try {
      const response = await fetch(`${HYPERCASH_API_BASE}/user/transactions`, {
        method: "POST",
        headers: { Authorization: authHeader(secretKey), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountCents,
          currency: "BRL",
          paymentMethod: "CREDIT_CARD",
          card: { hash: data.cardToken },
          installments,
          customer: { ...hypercashCustomer, externalRef: externalId },
          shipping: { fee: 0, address },
          items: [
            ...items.map((item) => ({
              title: item.title,
              unitPrice: Math.round(item.price * 100),
              quantity: item.quantity,
              tangible: true,
              externalRef: item.slug,
            })),
            ...(interestCents > 0
              ? [
                  {
                    title: "Juros do parcelamento",
                    unitPrice: interestCents,
                    quantity: 1,
                    tangible: false,
                    externalRef: "juros",
                  },
                ]
              : []),
          ],
          ...(host ? { postbackUrl: `https://${host}/api/webhooks/hypercash` } : {}),
          metadata: JSON.stringify({ externalId }),
          ...(ip ? { ip } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: HypercashTransaction;
        message?: unknown;
      } | null;
      if (!response.ok || !body?.data) {
        console.error("HyperCash transação falhou:", response.status, JSON.stringify(body));
        // Grava a tentativa como "failed" com o erro da HyperCash, pra aparecer em /pedidos.
        await saveCardOrder({
          id: externalId,
          status: "failed",
          failureReason: `HyperCash ${response.status}: ${apiErrorText(body)}`,
        });
        return {
          ok: false,
          reason: "Não foi possível processar o cartão. Confira os dados e tente de novo.",
          refused: true,
        };
      }
      tx = body.data;
    } catch (error) {
      console.error("HyperCash sem resposta:", error);
      return { ok: false, reason: "Erro de conexão com o gateway de pagamento." };
    }

    const status = tx.status.toUpperCase();
    const refused = REFUSED.has(status);

    // Recusado também fica gravado (como "failed", com o motivo), pra aparecer em /pedidos.
    await saveCardOrder(
      refused
        ? {
            id: tx.id,
            status: "failed",
            failureReason: tx.refusedReason || "Recusado (sem motivo informado)",
          }
        : { id: tx.id, status: "pending", failureReason: null },
    );

    if (refused) return { ok: false, reason: refusedMessage(tx.refusedReason), refused: true };

    await sendUtmifyOrder({
      orderId: externalId,
      status: "waiting_payment",
      createdAt,
      customer: { name, email: email || null, phone: phone || null, document },
      products: items.map((item) => ({
        id: item.slug,
        name: item.title,
        quantity: item.quantity,
        priceInCents: Math.round(item.price * 100),
      })),
      trackingParameters,
    });

    if (status === "PAID") await applyHypercashStatus(tx);

    const upsellProduct = APPROVED.has(status) ? getProductBySlug(UPSELL_TEST_SLUG) : undefined;
    if (upsellProduct) {
      const upsellExternalId = crypto.randomUUID();
      const upsellCents = Math.round(upsellProduct.price * 100);
      const upsell = {
        externalId: upsellExternalId,
        amount: upsellProduct.price,
        items: [
          {
            slug: upsellProduct.slug,
            title: upsellProduct.title,
            size: items[0]?.size ?? "",
            quantity: 1,
            price: upsellProduct.price,
          },
        ],
      };
      try {
        const response = await fetch(`${HYPERCASH_API_BASE}/user/transactions`, {
          method: "POST",
          headers: { Authorization: authHeader(secretKey), "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: upsellCents,
            currency: "BRL",
            paymentMethod: "CREDIT_CARD",
            card: { hash: data.cardToken },
            installments: 1,
            customer: { ...hypercashCustomer, externalRef: upsellExternalId },
            shipping: { fee: 0, address },
            items: [
              {
                title: upsellProduct.title,
                unitPrice: upsellCents,
                quantity: 1,
                tangible: true,
                externalRef: upsellProduct.slug,
              },
            ],
            ...(host ? { postbackUrl: `https://${host}/api/webhooks/hypercash` } : {}),
            metadata: JSON.stringify({ externalId: upsellExternalId, upsellOf: tx.id }),
            ...(ip ? { ip } : {}),
          }),
        });
        const body = (await response.json().catch(() => null)) as {
          data?: HypercashTransaction;
          message?: unknown;
        } | null;
        if (!response.ok || !body?.data) {
          console.error("Upsell falhou:", response.status, JSON.stringify(body));
          await saveCardOrder({
            id: upsellExternalId,
            status: "failed",
            failureReason: `Upsell: HyperCash ${response.status}: ${apiErrorText(body)}`,
            upsell,
          });
        } else {
          const upsellTx = body.data;
          const upsellStatus = upsellTx.status.toUpperCase();
          if (REFUSED.has(upsellStatus)) {
            await saveCardOrder({
              id: upsellTx.id,
              status: "failed",
              failureReason: `Upsell: ${upsellTx.refusedReason || "Recusado (sem motivo informado)"}`,
              upsell,
            });
          } else {
            await saveCardOrder({
              id: upsellTx.id,
              status: "pending",
              failureReason: null,
              upsell,
            });
            await sendUtmifyOrder({
              orderId: upsellExternalId,
              status: "waiting_payment",
              createdAt: new Date(),
              customer: { name, email: email || null, phone: phone || null, document },
              products: upsell.items.map((item) => ({
                id: item.slug,
                name: item.title,
                quantity: item.quantity,
                priceInCents: upsellCents,
              })),
              trackingParameters,
            });
            if (upsellStatus === "PAID") await applyHypercashStatus(upsellTx);
          }
        }
      } catch (error) {
        console.error("Upsell sem resposta:", error);
      }
    }

    return {
      ok: true,
      orderId: tx.id,
      status: APPROVED.has(status) ? "paid" : "pending",
      amount,
      brand: tx.card?.brand ?? null,
      lastDigits: tx.card?.lastDigits ?? null,
    };
  });

const UPSELL_TEST_SLUG = "upsell-kit-10-calcados-masculinos-sortidos";

/** Usado pelo checkout enquanto o cartão está em análise: confere na HyperCash e atualiza. */
export const getCardOrderStatus = createServerFn({ method: "POST" })
  .validator((input: { orderId: string }) => input)
  .handler(async ({ data }): Promise<{ status: string; reason?: string }> => {
    try {
      const tx = await fetchHypercashTransaction(data.orderId);
      if (!tx) return { status: "unknown" };
      const status = await applyHypercashStatus(tx);
      if (APPROVED.has(tx.status.toUpperCase())) return { status: "paid" };
      return status === "failed"
        ? { status, reason: refusedMessage(tx.refusedReason) }
        : { status };
    } catch (error) {
      console.error("HyperCash consulta de status falhou:", error);
      return { status: "unknown" };
    }
  });
