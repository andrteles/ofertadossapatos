CREATE TABLE IF NOT EXISTS public.ad_click_ids (
  click_id text PRIMARY KEY,
  platform text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ad_click_ids TO service_role;
ALTER TABLE public.ad_click_ids ENABLE ROW LEVEL SECURITY;
