-- Run once in Supabase SQL Editor to enable manual eBay sales tracking.
create table if not exists public.hatmoc_ebay_sales (
 order_id text primary key,
 sale_date date not null,
 product text not null,
 quantity integer not null default 1 check (quantity > 0),
 total numeric(10,2) not null check (total >= 0),
 status text not null check (status in ('awaiting_payment','paid','fulfilled','cancelled')),
 created_at timestamptz not null default now()
);
alter table public.hatmoc_ebay_sales enable row level security;
-- Access is server-side only through the service-role key and admin password.
