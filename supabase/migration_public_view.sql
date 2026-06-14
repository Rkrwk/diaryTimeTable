-- Run this ONCE in the Supabase SQL Editor to enable the public, no-login
-- schedule viewer. Safe to run on an existing database.
-- (A brand-new project that runs schema.sql already includes this.)

create or replace function get_public_schedule(code text)
returns table (
  owner_name    text,
  title         text,
  day_type      text,
  planned_start time,
  planned_end   time,
  category      text,
  sort_order    int
)
language sql security definer stable set search_path = public as $$
  select coalesce(p.display_name, p.username) as owner_name,
         a.title, a.day_type, a.planned_start, a.planned_end, a.category, a.sort_order
  from profiles p
  join activities a on a.owner_id = p.id
  where p.share_code = upper(code)
  order by a.day_type, a.sort_order;
$$;

grant execute on function get_public_schedule(text) to anon, authenticated;
