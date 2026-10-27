-- Motivo da falha do cartão (erro da HyperCash ou refusedReason), para aparecer em /pedidos.
ALTER TABLE public.sagacepay_orders ADD COLUMN IF NOT EXISTS failure_reason text;
