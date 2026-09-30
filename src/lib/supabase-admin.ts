import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { TrackingParameters } from "@/lib/utm";

/** A tabela zedy_webhook_events precisa ser criada manualmente via SQL editor
 * do Supabase (ver supabase/migrations/) — os tipos gerados ainda não a
 * conhecem, por isso o tipo é definido aqui à mão, batendo com a migration. */
export type ZedyWebhookEventRow = {
  order_id: string;
  event_type: string;
  payload: unknown;
  processed_at: string;
};

/** A tabela pixel_settings também precisa ser criada manualmente via SQL
 * editor do Supabase (ver supabase/migrations/) — mesmo motivo do tipo acima. */
export type PixelSettingsRow = {
  id: number;
  utmify_html: string | null;
  utmify_api_token: string | null;
  tiktok_pixel_id: string | null;
  tiktok_access_token: string | null;
  password_hash: string | null;
  updated_at: string;
};

/** A tabela sagacepay_orders também precisa ser criada manualmente via SQL
 * editor do Supabase (ver supabase/migrations/) — mesmo motivo dos tipos acima. */
export type SagacepayOrderItem = {
  slug: string;
  title: string;
  size: string;
  quantity: number;
  price: number;
};

export type SagacepayOrderRow = {
  id: string;
  external_id: string;
  status: string;
  amount: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_document: string;
  address_cep: string;
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  items: SagacepayOrderItem[];
  pix_code: string | null;
  pix_qr_code: string | null;
  paid_at: string | null;
  dispatched_at: string | null;
  tracking_parameters: TrackingParameters | null;
  created_at: string;
  updated_at: string;
};

let cached: SupabaseClient | null = null;

/** Cliente com a service_role key do Supabase da loja: só deve ser usado
 * dentro de server functions, nunca importado em código que roda no
 * navegador. Retorna null se as chaves não estiverem configuradas. */
export function getSupabaseAdmin(): SupabaseClient | null {
  // A loja usa um projeto Supabase externo (do cliente), não o banco interno
  // do Lovable Cloud — os nomes SUPABASE_* são reservados/gerenciados, por
  // isso os valores do projeto externo vivem em STORE_SUPABASE_*.
  const url = process.env["STORE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const key =
    process.env["STORE_SUPABASE_SERVICE_ROLE_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
