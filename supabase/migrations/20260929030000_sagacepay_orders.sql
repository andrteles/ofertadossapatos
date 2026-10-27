CREATE TABLE public.sagacepay_orders (
  id text PRIMARY KEY, -- id da venda na SagacePay
  external_id text NOT NULL UNIQUE, -- gerado por nós, usado como idempotency-key
  status text NOT NULL DEFAULT 'pending',
  amount numeric NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  customer_document text NOT NULL,
  address_cep text NOT NULL,
  address_street text NOT NULL,
  address_number text NOT NULL,
  address_complement text,
  address_neighborhood text NOT NULL,
  address_city text NOT NULL,
  address_state text NOT NULL,
  items jsonb NOT NULL, -- [{ slug, title, size, quantity, price }]
  pix_code text,
  pix_qr_code text,
  paid_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sagacepay_orders TO service_role;
ALTER TABLE public.sagacepay_orders ENABLE ROW LEVEL SECURITY;
