alter table public.ledger_entries
  add column if not exists person text not null default 'yangbao'
  check (person in ('yangbao', 'yubao'));

create table if not exists public.family_savings (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('month', 'year')),
  period_start date not null,
  person text not null check (person in ('yangbao', 'yubao')),
  source_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_savings_period_idx
  on public.family_savings (period_type, period_start);

grant select, insert, update, delete on public.family_savings to anon, authenticated;

alter table public.family_savings enable row level security;

drop policy if exists "Public demo read family savings" on public.family_savings;
drop policy if exists "Public demo write family savings" on public.family_savings;

create policy "Public demo read family savings"
  on public.family_savings for select
  to anon, authenticated
  using (true);

create policy "Public demo write family savings"
  on public.family_savings for all
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.touch_family_savings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists family_savings_touch_updated_at on public.family_savings;
create trigger family_savings_touch_updated_at
before update on public.family_savings
for each row execute function public.touch_family_savings_updated_at();
