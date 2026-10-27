-- UTMs (src, sck, utm_*) da visita, para reenviar à Utmify quando o pagamento confirmar.
ALTER TABLE public.sagacepay_orders ADD COLUMN IF NOT EXISTS tracking_parameters jsonb;
