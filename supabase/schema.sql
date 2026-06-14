-- profiles: mirrors auth.users. We auth with a synthesized email derived from
-- the username, and people share with each other using a short share_code.
create table if not exists profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text unique not null,
  username      text unique,
  share_code    text unique,
  display_name  text
);

-- a short, human-friendly code (6 chars, no ambiguous letters/digits)
create or replace function gen_share_code()
returns text language sql volatile set search_path = public as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 30)::int + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- activities: the recurring schedule template
create table if not exists activities (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles (id) on delete cascade,
  title          text not null,
  day_type       text not null check (day_type in ('weekday', 'weekend')),
  planned_start  time,
  planned_end    time,
  category       text not null default 'rest' check (category in ('focus', 'move', 'rest')),
  sort_order     int  not null default 0,
  entry_date     date,
  created_at     timestamptz default now()
);

-- logs: one row per activity per day
create table if not exists logs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles (id) on delete cascade,
  activity_id   uuid not null references activities (id) on delete cascade,
  log_date      date not null,
  completed     boolean not null default false,
  note          text,
  actual_start  time,
  actual_end    time,
  updated_at    timestamptz default now(),
  unique (owner_id, activity_id, log_date)
);

-- reflections: daily / weekly / monthly free-text
create table if not exists reflections (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles (id) on delete cascade,
  period_type  text not null check (period_type in ('daily', 'weekly', 'monthly')),
  period_date  date not null,
  content      text,
  updated_at   timestamptz default now(),
  unique (owner_id, period_type, period_date)
);

-- shares: who can see / edit whose data
create table if not exists shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (id) on delete cascade,
  viewer_id   uuid not null references profiles (id) on delete cascade,
  permission  text not null default 'view' check (permission in ('view', 'edit')),
  created_at  timestamptz default now(),
  unique (owner_id, viewer_id)
);

-- access helpers (security definer so they can read shares without tripping its own RLS)
create or replace function can_view(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select target = auth.uid()
      or exists (select 1 from shares s where s.owner_id = target and s.viewer_id = auth.uid());
$$;

create or replace function can_edit(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select target = auth.uid()
      or exists (select 1 from shares s where s.owner_id = target and s.viewer_id = auth.uid() and s.permission = 'edit');
$$;

-- public, no-login viewer: anyone with a share code can read the TEMPLATE only.
-- It is security definer so it bypasses RLS in a controlled way and never exposes
-- daily logs or reflections — just the recurring activities and the owner's name.
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

-- row level security
alter table profiles    enable row level security;
alter table activities  enable row level security;
alter table logs        enable row level security;
alter table reflections enable row level security;
alter table shares      enable row level security;

create policy "profiles readable" on profiles for select to authenticated using (true);
create policy "update own profile" on profiles for update using (id = auth.uid());

create policy "view activities"   on activities for select using (can_view(owner_id));
create policy "insert activities" on activities for insert with check (can_edit(owner_id));
create policy "update activities" on activities for update using (can_edit(owner_id)) with check (can_edit(owner_id));
create policy "delete activities" on activities for delete using (can_edit(owner_id));

create policy "view logs"   on logs for select using (can_view(owner_id));
create policy "insert logs" on logs for insert with check (can_edit(owner_id));
create policy "update logs" on logs for update using (can_edit(owner_id)) with check (can_edit(owner_id));
create policy "delete logs" on logs for delete using (can_edit(owner_id));

create policy "view reflections"   on reflections for select using (can_view(owner_id));
create policy "insert reflections" on reflections for insert with check (can_edit(owner_id));
create policy "update reflections" on reflections for update using (can_edit(owner_id)) with check (can_edit(owner_id));
create policy "delete reflections" on reflections for delete using (can_edit(owner_id));

create policy "view shares"   on shares for select using (owner_id = auth.uid() or viewer_id = auth.uid());
create policy "insert shares" on shares for insert with check (owner_id = auth.uid());
create policy "update shares" on shares for update using (owner_id = auth.uid());
create policy "delete shares" on shares for delete using (owner_id = auth.uid());

-- calendar, goals, and single-day public detail
-- ===== goals v2: targets attached to activities (metric: hours or count) =====
alter table activities drop column if exists goal_id;
drop table if exists goals cascade;

create table goals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (id) on delete cascade,
  title       text not null,
  period_type text not null check (period_type in ('weekly', 'monthly')),
  metric      text not null check (metric in ('hours', 'count')),
  target      numeric not null default 0,
  created_at  timestamptz default now()
);

-- an activity can count toward one goal
alter table activities add column goal_id uuid references goals (id) on delete set null;

alter table goals enable row level security;
create policy "view goals"   on goals for select using (can_view(owner_id));
create policy "insert goals" on goals for insert with check (can_edit(owner_id));
create policy "update goals" on goals for update using (can_edit(owner_id)) with check (can_edit(owner_id));
create policy "delete goals" on goals for delete using (can_edit(owner_id));

-- ===== public progress: today + week/month completion + calendar + goals[] =====
create or replace function strip_private(t text)
returns text language sql immutable as $$
  select case when t is null then null else
    nullif(
      trim(both E' \t\n' from
        regexp_replace(
          regexp_replace(t, '/\*.*?\*/', '', 'gs'),  -- closed /* */ blocks
          '/\*.*', '', 's')                           -- any dangling /* to end
      ), '')
  end;
$$;

create or replace function get_public_progress(
  p_code text, p_today date, p_day_type text,
  p_week_start date, p_week_end date, p_month_start date, p_month_end date
)
returns json
language plpgsql security definer stable set search_path = public as $$
declare
  v_owner uuid; v_name text;
  v_today json; v_week json; v_month json; v_cal json; v_goals json; v_refl json;
begin
  select id, coalesce(display_name, username) into v_owner, v_name
  from profiles where share_code = upper(p_code);
  if v_owner is null then return null; end if;

  select coalesce(json_agg(json_build_object(
    'title', a.title, 'category', a.category,
    'planned_start', to_char(a.planned_start,'HH24:MI'), 'planned_end', to_char(a.planned_end,'HH24:MI'),
    'completed', coalesce(l.completed,false),
    'actual_start', to_char(l.actual_start,'HH24:MI'), 'actual_end', to_char(l.actual_end,'HH24:MI'),
    'note', strip_private(l.note)) order by a.sort_order, a.created_at), '[]'::json)
    into v_today
  from activities a
  left join logs l on l.activity_id = a.id and l.owner_id = v_owner and l.log_date = p_today
  where a.owner_id = v_owner and ((a.day_type = p_day_type and a.entry_date is null) or a.entry_date = p_today);

  with days as (select gs::date d, case when extract(dow from gs) in (0,6) then 'weekend' else 'weekday' end dt
                from generate_series(p_week_start,p_week_end,interval '1 day') gs),
       cnt as (select day_type, count(*) n from activities where owner_id=v_owner and entry_date is null group by day_type)
  select json_build_object(
    'done',(select count(*) from logs where owner_id=v_owner and completed and log_date between p_week_start and p_week_end),
    'planned',(select coalesce(sum(c.n),0) from days d left join cnt c on c.day_type=d.dt)
            +(select count(*) from activities where owner_id=v_owner and entry_date between p_week_start and p_week_end)
  ) into v_week;

  with days as (select gs::date d, case when extract(dow from gs) in (0,6) then 'weekend' else 'weekday' end dt
                from generate_series(p_month_start,p_month_end,interval '1 day') gs),
       cnt as (select day_type, count(*) n from activities where owner_id=v_owner and entry_date is null group by day_type)
  select json_build_object(
    'done',(select count(*) from logs where owner_id=v_owner and completed and log_date between p_month_start and p_month_end),
    'planned',(select coalesce(sum(c.n),0) from days d left join cnt c on c.day_type=d.dt)
            +(select count(*) from activities where owner_id=v_owner and entry_date between p_month_start and p_month_end)
  ) into v_month;

  with days as (select gs::date d, case when extract(dow from gs) in (0,6) then 'weekend' else 'weekday' end dt
                from generate_series(p_month_start,p_month_end,interval '1 day') gs),
       rcnt as (select day_type, count(*) n from activities where owner_id=v_owner and entry_date is null group by day_type),
       ones as (select entry_date d, count(*) n from activities where owner_id=v_owner and entry_date between p_month_start and p_month_end group by entry_date),
       done as (select log_date d, count(*) n from logs where owner_id=v_owner and completed and log_date between p_month_start and p_month_end group by log_date)
  select coalesce(json_agg(json_build_object('d',to_char(days.d,'YYYY-MM-DD'),
           'planned',coalesce(rc.n,0)+coalesce(o.n,0),'done',coalesce(dn.n,0)) order by days.d),'[]'::json)
    into v_cal
  from days left join rcnt rc on rc.day_type=days.dt left join ones o on o.d=days.d left join done dn on dn.d=days.d;

  select coalesce(json_agg(json_build_object(
    'title', g.title, 'period', g.period_type, 'metric', g.metric, 'target', g.target,
    'actual', case when g.metric = 'count' then
        (select count(*)::numeric from logs l join activities a on a.id=l.activity_id
         where a.goal_id=g.id and l.completed
           and l.log_date between (case when g.period_type='weekly' then p_week_start else p_month_start end)
                              and (case when g.period_type='weekly' then p_week_end else p_month_end end))
      else
        (select coalesce(sum(extract(epoch from (l.actual_end-l.actual_start))/60),0)::numeric
         from logs l join activities a on a.id=l.activity_id
         where a.goal_id=g.id and l.actual_start is not null and l.actual_end is not null and l.actual_end>l.actual_start
           and l.log_date between (case when g.period_type='weekly' then p_week_start else p_month_start end)
                              and (case when g.period_type='weekly' then p_week_end else p_month_end end))
      end
    ) order by g.created_at), '[]'::json)
    into v_goals
  from goals g where g.owner_id = v_owner;

  select json_build_object(
    'daily',   strip_private((select content from reflections where owner_id=v_owner and period_type='daily'   and period_date=p_today)),
    'weekly',  strip_private((select content from reflections where owner_id=v_owner and period_type='weekly'  and period_date=p_week_start)),
    'monthly', strip_private((select content from reflections where owner_id=v_owner and period_type='monthly' and period_date=p_month_start))
  ) into v_refl;

  return json_build_object('owner_name',v_name,'today',v_today,'week',v_week,'month',v_month,
    'calendar',v_cal,'goals',v_goals,'reflections',v_refl);
end;
$$;

grant execute on function get_public_progress(text, date, text, date, date, date, date) to anon, authenticated;

-- ===== public single-day detail =====
create or replace function get_public_day(p_code text, p_date date)
returns json
language plpgsql security definer stable set search_path = public as $$
declare
  v_owner uuid; v_name text;
  v_daytype text := case when extract(dow from p_date) in (0,6) then 'weekend' else 'weekday' end;
  v_acts json;
begin
  select id, coalesce(display_name, username) into v_owner, v_name
  from profiles where share_code = upper(p_code);
  if v_owner is null then return null; end if;

  select coalesce(json_agg(json_build_object(
    'title', a.title, 'category', a.category,
    'planned_start', to_char(a.planned_start,'HH24:MI'), 'planned_end', to_char(a.planned_end,'HH24:MI'),
    'completed', coalesce(l.completed,false),
    'actual_start', to_char(l.actual_start,'HH24:MI'), 'actual_end', to_char(l.actual_end,'HH24:MI'),
    'note', strip_private(l.note)) order by a.sort_order, a.created_at), '[]'::json)
    into v_acts
  from activities a
  left join logs l on l.activity_id = a.id and l.owner_id = v_owner and l.log_date = p_date
  where a.owner_id = v_owner and ((a.day_type = v_daytype and a.entry_date is null) or a.entry_date = p_date);

  return json_build_object('owner_name',v_name,'date',to_char(p_date,'YYYY-MM-DD'),
    'activities',v_acts,
    'reflection', strip_private((select content from reflections where owner_id=v_owner and period_type='daily' and period_date=p_date)));
end;
$$;

grant execute on function get_public_day(text, date) to anon, authenticated;
