create table if not exists public.hatmoc_direct_sales (
 sale_id text primary key,
 sale_date date not null,
 product text not null,
 quantity integer not null default 1 check (quantity > 0),
 total numeric(10,2) not null check (total >= 0),
 status text not null check (status in ('awaiting_payment','paid','fulfilled','cancelled')),
 source text not null check (source in ('Facebook / Instagram','Friends & family','Local pickup / in-person','Markets / stalls','Other')),
 created_at timestamptz not null default now()
);
alter table public.hatmoc_direct_sales enable row level security;