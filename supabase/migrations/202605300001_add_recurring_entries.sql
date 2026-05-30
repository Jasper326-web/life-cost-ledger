alter table public.ledger_entries
  add column if not exists is_recurring boolean not null default false;

create index if not exists ledger_entries_recurring_period_idx
  on public.ledger_entries (is_recurring, period_type, period_start);
