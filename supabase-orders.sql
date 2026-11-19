-- Run once in your own Supabase project SQL editor.
create table if not exists public.hatmoc_orders (
 reference text primary key,
 created_at timestamptz not null default now(),
 customer_name text not null,
 customer_email text not null,
 customer_phone text,
 items jsonb not null,
 total text not null,
 delivery_method text not null,
 destination text,
 address text,
 payment_ready boolean not null default false,
 status text not null default 'awaiting_payment' check(status in ('awaiting_quote','awaiting_payment','payment_claimed','paid','fulfilled')),
 payment_confirmed_at timestamptz,
 confirmation_sent_at timestamptz
);
alter table public.hatmoc_orders enable row level security;
-- No public RLS policies: only the Vercel server using its secret service-role key can access orders.
