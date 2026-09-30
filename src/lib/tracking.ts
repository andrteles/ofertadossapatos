import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface PublicTrackingConfig {
  tiktokPixelId: string | null;
  utmifyHtml: string | null;
}

export async function fetchPixelRow() {
  // Rastreamento é opcional: se o banco não estiver configurado ou falhar,
  // a loja continua funcionando sem pixel em vez de quebrar a página.
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin
      .from("pixel_settings")
      .select("utmify_html, utmify_api_token, tiktok_pixel_id, tiktok_access_token")
      .eq("id", 1)
      .single();
    if (error || !data) return null;
    return data;
  } catch (err) {
    console.warn("[tracking] configuração do pixel indisponível:", (err as Error).message);
    return null;
  }
}

export const getPublicTrackingConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicTrackingConfig> => {
    const row = await fetchPixelRow();
    return {
      tiktokPixelId: row?.tiktok_pixel_id ?? null,
      utmifyHtml: row?.utmify_html ?? null,
    };
  },
);

interface TikTokEventContent {
  contentId: string;
  contentName: string;
  quantity?: number;
  price?: number;
}

type TikTokBrowserEvent = "ViewContent" | "AddToCart" | "InitiateCheckout" | "CompletePayment";

interface TrackTikTokEventInput {
  event: TikTokBrowserEvent;
  eventId: string;
  url: string;
  currency?: string;
  value?: number;
  contents?: TikTokEventContent[];
}

/** Dispara o evento no pixel do navegador (window.ttq) usando o mesmo event_id passado pro
 * trackTikTokEvent (CAPI), permitindo o TikTok deduplicar as duas chamadas do mesmo evento. */
export function trackPixelEvent(
  event: TikTokBrowserEvent,
  eventId: string,
  params: { currency?: string; value?: number; contents?: TikTokEventContent[] },
) {
  if (typeof window === "undefined") return;
  window.ttq?.track(
    event,
    {
      currency: params.currency ?? "BRL",
      value: params.value,
      contents: params.contents?.map((item) => ({
        content_id: item.contentId,
        content_name: item.contentName,
        quantity: item.quantity ?? 1,
        price: item.price,
      })),
    },
    { event_id: eventId },
  );
}

type MetaBrowserEvent = "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase";

/** Dispara o evento no Pixel da Meta (window.fbq) que já vem embutido no script colado em
 * "Pixel da Utmify". Um evento explícito como este sempre tem prioridade sobre a detecção
 * automática de cliques do Meta (que erra o nome do evento, ex: "SubscribedButtonClick"). */
export function trackMetaPixelEvent(
  event: MetaBrowserEvent,
  eventId: string,
  params: {
    currency?: string;
    value?: number;
    contentIds: string[];
    contentName?: string;
    numItems?: number;
  },
) {
  if (typeof window === "undefined") return;
  window.fbq?.(
    "track",
    event,
    {
      content_type: "product",
      content_ids: params.contentIds,
      content_name: params.contentName,
      currency: params.currency ?? "BRL",
      value: params.value,
      ...(params.numItems !== undefined ? { num_items: params.numItems } : {}),
    },
    { eventID: eventId },
  );
}

export const trackTikTokEvent = createServerFn({ method: "POST" })
  .validator((input: TrackTikTokEventInput) => input)
  .handler(async ({ data }) => {
    const row = await fetchPixelRow();
    const pixelId = row?.tiktok_pixel_id;
    const accessToken = row?.tiktok_access_token;
    if (!pixelId || !accessToken) return { sent: false };

    const userAgent = getRequestHeader("user-agent");
    const ip = getRequestIP();

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
              event: data.event,
              event_time: Math.floor(Date.now() / 1000),
              event_id: data.eventId,
              user: {
                ...(ip ? { ip } : {}),
                ...(userAgent ? { user_agent: userAgent } : {}),
              },
              page: { url: data.url },
              properties: {
                currency: data.currency ?? "BRL",
                value: data.value,
                contents: data.contents?.map((item) => ({
                  content_id: item.contentId,
                  content_name: item.contentName,
                  quantity: item.quantity ?? 1,
                  price: item.price,
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
  });
