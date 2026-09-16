-- Server-only table: app writes via service_role from Vercel API routes only.
-- If you still get RLS errors after setting service_role in Vercel, run this once:

alter table public.meetings disable row level security;
