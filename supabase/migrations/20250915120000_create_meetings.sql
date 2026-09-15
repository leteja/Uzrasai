create table if not exists public.meetings (
  id uuid primary key,
  created_at timestamptz not null default now(),
  participants jsonb not null default '[]'::jsonb,
  expected_count integer not null default 0,
  summary_instructions text,
  speaker_names jsonb not null default '{}'::jsonb,
  markdown text not null default '',
  result jsonb not null,
  locked boolean not null default false,
  locked_at timestamptz
);

create index if not exists meetings_created_at_idx on public.meetings (created_at desc);

alter table public.meetings enable row level security;
