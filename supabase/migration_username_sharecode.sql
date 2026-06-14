-- Run this ONCE in the Supabase SQL Editor if you already ran the original
-- schema.sql. It adds username + share_code support without dropping data.
-- (For a brand-new project, just run schema.sql instead — it already includes all this.)

-- 1) new columns
alter table profiles add column if not exists username   text;
alter table profiles add column if not exists share_code text;

create unique index if not exists profiles_username_key   on profiles (username);
create unique index if not exists profiles_share_code_key on profiles (share_code);

-- 2) share-code generator
create or replace function gen_share_code()
returns text language sql volatile set search_path = public as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 30)::int + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- 3) updated new-user trigger
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  uname text := coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1));
begin
  insert into profiles (id, email, username, display_name, share_code)
  values (
    new.id,
    new.email,
    uname,
    coalesce(new.raw_user_meta_data ->> 'display_name', uname),
    gen_share_code()
  );
  return new;
end;
$$;

-- 4) backfill any existing rows that predate these columns
update profiles set username   = split_part(email, '@', 1) where username   is null;
update profiles set display_name = coalesce(display_name, username) where display_name is null;
update profiles set share_code  = gen_share_code()          where share_code is null;
