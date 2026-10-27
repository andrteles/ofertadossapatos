CREATE TABLE public.zedy_webhook_events (
  order_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, event_type)
);
GRANT ALL ON public.zedy_webhook_events TO service_role;
ALTER TABLE public.zedy_webhook_events ENABLE ROW LEVEL SECURITY;
