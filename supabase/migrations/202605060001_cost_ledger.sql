create extension if not exists "pgcrypto";

create table if not exists public.ledger_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  flow_type text not null check (flow_type in ('income', 'expense')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.ledger_categories(id) on delete cascade,
  scope text not null check (scope in ('personal', 'family')),
  period_type text not null check (period_type in ('month', 'year')),
  period_start date not null,
  item_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ledger_entries_period_idx
  on public.ledger_entries (scope, period_type, period_start);

create index if not exists ledger_entries_category_idx
  on public.ledger_entries (category_id);

alter table public.ledger_categories enable row level security;
alter table public.ledger_entries enable row level security;

drop policy if exists "Public demo read categories" on public.ledger_categories;
drop policy if exists "Public demo write categories" on public.ledger_categories;
drop policy if exists "Public demo read entries" on public.ledger_entries;
drop policy if exists "Public demo write entries" on public.ledger_entries;

create policy "Public demo read categories"
  on public.ledger_categories for select
  to anon, authenticated
  using (true);

create policy "Public demo write categories"
  on public.ledger_categories for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public demo read entries"
  on public.ledger_entries for select
  to anon, authenticated
  using (true);

create policy "Public demo write entries"
  on public.ledger_entries for all
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.touch_ledger_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ledger_entries_touch_updated_at on public.ledger_entries;
create trigger ledger_entries_touch_updated_at
before update on public.ledger_entries
for each row execute function public.touch_ledger_entries_updated_at();

insert into public.ledger_categories (name, flow_type, sort_order)
values
  ('收入', 'income', 0),
  ('生活成本', 'expense', 1),
  ('副业投入', 'expense', 2)
on conflict do nothing;

insert into public.ledger_entries (category_id, scope, period_type, period_start, item_name, amount, note)
select c.id, 'personal', 'month', date_trunc('month', current_date)::date, item_name, amount, note
from public.ledger_categories c
cross join (
  values
    ('收入', '主业工资', 32000::numeric, '税后月收入'),
    ('生活成本', '房租', 9800::numeric, '固定支出'),
    ('生活成本', '餐饮', 4200::numeric, '日常消费'),
    ('生活成本', '交通', 760::numeric, '地铁和打车'),
    ('副业投入', '工具订阅', 680::numeric, 'AI 与设计软件'),
    ('副业投入', '投放测试', 1200::numeric, '小预算验证')
) as seed(category_name, item_name, amount, note)
where c.name = seed.category_name
  and not exists (
    select 1 from public.ledger_entries e
    where e.item_name = seed.item_name
      and e.period_type = 'month'
      and e.period_start = date_trunc('month', current_date)::date
  );
