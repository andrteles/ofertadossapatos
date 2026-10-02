import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

import { getProductBySlug } from "@/lib/products";
import {
  isValidCep,
  isValidDocument,
  sanitizeTrackingParameters,
  type CreateCheckoutOrderInput,
} from "@/lib/sagacepay";
import {
  getSupabaseAdmin,
  type SagacepayOrderItem,
  type SagacepayOrderRow,
} from "@/lib/supabase-admin";
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
    }) {
      const admin = getSupabaseAdmin();
      if (!admin) return;
      const row = {
        id: input.id,
        external_id: externalId,
        status: input.status,
        amount,
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
        items,
        pix_code: null,
        pix_qr_code: null,
      };
      await insertCardOrder(row, trackingParameters, input.failureReason);
    }

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
          customer: {
            name,
            email,
            phone,
            document: { number: document, type: document.length === 14 ? "CNPJ" : "CPF" },
            externalRef: externalId,
            address,
          },
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

    if (APPROVED.has(status)) {
      await chargeUpsell(
        {
          external_id: externalId,
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
          items,
          tracking_parameters: trackingParameters,
        },
        data.cardToken,
        { host, ip },
      );
    }

    return {
      ok: true,
      orderId: tx.id,
      status: APPROVED.has(status) ? "paid" : "pending",
      amount,
      brand: tx.card?.brand ?? null,
      lastDigits: onlyDigits(tx.card?.lastDigits ?? "").slice(-4) || null,
    };
  });

const UPSELL_SLUG = "upsell-kit-10-calcados-masculinos-sortidos";
const UPSELL_DRAW_START = "2026-10-02T14:27:00Z";
const UPSELL_BLOCK_SIZE = 5;
const UPSELL_PER_BLOCK = 3;
const UPSELL_FORCED_FIRST = 1;

async function drawUpsell(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  externalId: string,
): Promise<boolean> {
  const [approved, upsells] = await Promise.all([
    admin
      .from("sagacepay_orders")
      .select("id", { count: "exact", head: true })
      .is("pix_code", null)
      .in("status", ["paid", "refunded"])
      .not("external_id", "like", "upsell-%")
      .neq("external_id", externalId)
      .gte("created_at", UPSELL_DRAW_START),
    admin
      .from("sagacepay_orders")
      .select("id", { count: "exact", head: true })
      .like("external_id", "upsell-%")
      .gte("created_at", UPSELL_DRAW_START),
  ]);
  if (approved.error || upsells.error) return false;
  if ((approved.count ?? 0) < UPSELL_FORCED_FIRST) return true;
  const position = (approved.count ?? 0) - UPSELL_FORCED_FIRST;
  const drawn = Math.max(0, (upsells.count ?? 0) - UPSELL_FORCED_FIRST);
  const block = Math.floor(position / UPSELL_BLOCK_SIZE);
  const remaining = UPSELL_BLOCK_SIZE - (position % UPSELL_BLOCK_SIZE);
  const needed = Math.min(remaining, Math.max(0, UPSELL_PER_BLOCK * (block + 1) - drawn));
  return Math.random() * remaining < needed;
}

type CardOrderInsert = Omit<
  SagacepayOrderRow,
  | "tracking_parameters"
  | "failure_reason"
  | "paid_at"
  | "dispatched_at"
  | "created_at"
  | "updated_at"
>;

async function insertCardOrder(
  row: CardOrderInsert,
  trackingParameters: SagacepayOrderRow["tracking_parameters"],
  failureReason: string | null,
) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  // Colunas opcionais (migrations que podem não ter sido aplicadas): tenta com elas, depois sem.
  let { error } = await admin.from("sagacepay_orders").insert({
    ...row,
    tracking_parameters: trackingParameters,
    ...(failureReason ? { failure_reason: failureReason } : {}),
  });
  if (error) {
    ({ error } = await admin
      .from("sagacepay_orders")
      .insert({ ...row, tracking_parameters: trackingParameters }));
  }
  if (error) ({ error } = await admin.from("sagacepay_orders").insert(row));
  if (error) console.error("Erro ao gravar pedido de cartão:", error);
}

type UpsellSource = Pick<
  SagacepayOrderRow,
  | "external_id"
  | "customer_name"
  | "customer_email"
  | "customer_phone"
  | "customer_document"
  | "address_cep"
  | "address_street"
  | "address_number"
  | "address_complement"
  | "address_neighborhood"
  | "address_city"
  | "address_state"
  | "items"
  | "tracking_parameters"
>;

async function chargeUpsell(
  order: UpsellSource,
  cardToken: string,
  request: { host: string | undefined; ip: string | undefined },
) {
  try {
    const product = getProductBySlug(UPSELL_SLUG);
    const admin = getSupabaseAdmin();
    if (!product || !admin) return;
    const externalId = `upsell-${order.external_id}`;
    const { data: existing } = await admin
      .from("sagacepay_orders")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing) return;
    if (!(await drawUpsell(admin, order.external_id))) return;

    const amountCents = Math.round(product.price * 100);
    const items: SagacepayOrderItem[] = [
      {
        slug: product.slug,
        title: product.title,
        size: order.items[0]?.size ?? "",
        quantity: 1,
        price: product.price,
      },
    ];
    const document = order.customer_document;
    const address = {
      street: order.address_street,
      streetNumber: order.address_number,
      ...(order.address_complement ? { complement: order.address_complement } : {}),
      zipCode: order.address_cep,
      neighborhood: order.address_neighborhood,
      city: order.address_city,
      state: order.address_state,
      country: "BR",
    };
    const save = (id: string, status: "pending" | "failed", failureReason: string | null) =>
      insertCardOrder(
        {
          id,
          external_id: externalId,
          status,
          amount: product.price,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          customer_phone: order.customer_phone,
          customer_document: document,
          address_cep: order.address_cep,
          address_street: order.address_street,
          address_number: order.address_number,
          address_complement: order.address_complement,
          address_neighborhood: order.address_neighborhood,
          address_city: order.address_city,
          address_state: order.address_state,
          items,
          pix_code: null,
          pix_qr_code: null,
        },
        order.tracking_parameters,
        failureReason,
      );

    const response = await fetch(`${HYPERCASH_API_BASE}/user/transactions`, {
      method: "POST",
      headers: { Authorization: authHeader(getSecretKey()), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountCents,
        currency: "BRL",
        paymentMethod: "CREDIT_CARD",
        card: { hash: cardToken },
        installments: 1,
        customer: {
          name: order.customer_name,
          email: order.customer_email ?? "",
          phone: order.customer_phone ?? "",
          document: { number: document, type: document.length === 14 ? "CNPJ" : "CPF" },
          externalRef: externalId,
          address,
        },
        shipping: { fee: 0, address },
        items: [
          {
            title: product.title,
            unitPrice: amountCents,
            quantity: 1,
            tangible: true,
            externalRef: product.slug,
          },
        ],
        ...(request.host ? { postbackUrl: `https://${request.host}/api/webhooks/hypercash` } : {}),
        metadata: JSON.stringify({ externalId }),
        ...(request.ip ? { ip: request.ip } : {}),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      data?: HypercashTransaction;
      message?: unknown;
    } | null;
    if (!response.ok || !body?.data) {
      console.error("Upsell falhou:", response.status, JSON.stringify(body));
      await save(
        externalId,
        "failed",
        `Upsell: HyperCash ${response.status}: ${apiErrorText(body)}`,
      );
      return;
    }
    const tx = body.data;
    const status = tx.status.toUpperCase();
    if (REFUSED.has(status)) {
      await save(
        tx.id,
        "failed",
        `Upsell: ${tx.refusedReason || "Recusado (sem motivo informado)"}`,
      );
      return;
    }
    await save(tx.id, "pending", null);
    await sendUtmifyOrder({
      orderId: externalId,
      status: "waiting_payment",
      createdAt: new Date(),
      customer: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
        document,
      },
      products: items.map((item) => ({
        id: item.slug,
        name: item.title,
        quantity: item.quantity,
        priceInCents: amountCents,
      })),
      trackingParameters: order.tracking_parameters,
    });
    if (status === "PAID") await applyHypercashStatus(tx);
  } catch (error) {
    console.error("Upsell sem resposta:", error);
  }
}

export const chargeCardUpsell = createServerFn({ method: "POST" })
  .validator((input: { orderId: string; cardToken: string }) => input)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const tx = await fetchHypercashTransaction(data.orderId);
      if (!tx || !APPROVED.has(tx.status.toUpperCase())) return { ok: false };
      const admin = getSupabaseAdmin();
      if (!admin) return { ok: false };
      const { data: order } = await admin
        .from("sagacepay_orders")
        .select("*")
        .eq("id", data.orderId)
        .maybeSingle();
      const row = order as SagacepayOrderRow | null;
      if (!row || row.external_id.startsWith("upsell-")) return { ok: false };
      await chargeUpsell(row, data.cardToken, {
        host: getRequestHeader("x-forwarded-host") || getRequestHeader("host"),
        ip: getRequestHeader("cf-connecting-ip") || getRequestIP({ xForwardedFor: true }),
      });
      return { ok: true };
    } catch (error) {
      console.error("Upsell após análise falhou:", error);
      return { ok: false };
    }
  });

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
