-- Add status field to accounts (prospect vs customer, for wholesale accounts)
alter table accounts
  add column if not exists status text not null default 'customer'
  check (status in ('prospect', 'customer'));
