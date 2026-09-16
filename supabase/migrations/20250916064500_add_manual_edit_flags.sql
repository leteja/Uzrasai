alter table public.meetings add column if not exists manually_edited boolean not null default false;
alter table public.meetings add column if not exists edited_at timestamptz;
