create table if not exists public.ledger_people (
  code text primary key check (code in ('yangbao', 'yubao')),
  display_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.ledger_people (code, display_name, sort_order)
values
  ('yangbao', '阳宝', 1),
  ('yubao', '雨宝', 2)
on conflict (code) do update
set display_name = excluded.display_name,
    sort_order = excluded.sort_order;

alter table public.ledger_entries
  drop constraint if exists ledger_entries_person_check;

alter table public.family_savings
  drop constraint if exists family_savings_person_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ledger_entries_person_fkey'
      and conrelid = 'public.ledger_entries'::regclass
  ) then
    alter table public.ledger_entries
      add constraint ledger_entries_person_fkey
      foreign key (person) references public.ledger_people(code)
      on update cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'family_savings_person_fkey'
      and conrelid = 'public.family_savings'::regclass
  ) then
    alter table public.family_savings
      add constraint family_savings_person_fkey
      foreign key (person) references public.ledger_people(code)
      on update cascade;
  end if;
end;
$$;

create index if not exists ledger_entries_person_period_idx
  on public.ledger_entries (person, period_type, period_start);

create index if not exists family_savings_person_period_idx
  on public.family_savings (person, period_type, period_start);

grant select on public.ledger_people to anon, authenticated;

alter table public.ledger_people enable row level security;

drop policy if exists "Public demo read people" on public.ledger_people;

create policy "Public demo read people"
  on public.ledger_people for select
  to anon, authenticated
  using (true);
