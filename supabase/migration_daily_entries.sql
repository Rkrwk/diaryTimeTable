-- Run this ONCE in the Supabase SQL Editor to enable per-day diary entries.
-- Adds activities.entry_date: NULL = recurring routine (by weekday/weekend),
-- a date = a one-off entry that only appears on that day. Also updates the
-- public progress function to count one-offs correctly. Safe on an existing DB.

alter table activities add column if not exists entry_date date;
create index if not exists activities_owner_entry_date_idx
  on activities (owner_id, entry_date);

create or replace function get_public_progress(
  p_code        text,
  p_today       date,
  p_day_type    text,
  p_week_start  date,
  p_week_end    date,
  p_month_start date,
  p_month_end   date
)
returns json
language plpgsql security definer stable set search_path = public as $$
declare
  v_owner uuid;
  v_name  text;
  v_today json;
  v_week  json;
  v_month json;
begin
  select id, coalesce(display_name, username)
    into v_owner, v_name
  from profiles
  where share_code = upper(p_code);

  if v_owner is null then
    return null;
  end if;

  -- today's list = routine items for this day type + one-offs dated today
  select coalesce(json_agg(
           json_build_object(
             'title',         a.title,
             'category',      a.category,
             'planned_start', to_char(a.planned_start, 'HH24:MI'),
             'planned_end',   to_char(a.planned_end,   'HH24:MI'),
             'completed',     coalesce(l.completed, false),
             'actual_start',  to_char(l.actual_start, 'HH24:MI'),
             'actual_end',    to_char(l.actual_end,   'HH24:MI'),
             'note',          l.note
           ) order by a.sort_order, a.created_at
         ), '[]'::json)
    into v_today
  from activities a
  left join logs l
    on l.activity_id = a.id and l.owner_id = v_owner and l.log_date = p_today
  where a.owner_id = v_owner
    and ((a.day_type = p_day_type and a.entry_date is null) or a.entry_date = p_today);

  -- weekly: planned = routine-per-day across the week + one-offs dated in the week
  with days as (
    select gs::date as d,
           case when extract(dow from gs) in (0, 6) then 'weekend' else 'weekday' end as dt
    from generate_series(p_week_start, p_week_end, interval '1 day') gs
  ),
  cnt as (
    select day_type, count(*) n from activities
    where owner_id = v_owner and entry_date is null group by day_type
  )
  select json_build_object(
    'done', (select count(*) from logs
             where owner_id = v_owner and completed
               and log_date between p_week_start and p_week_end),
    'planned',
      (select coalesce(sum(c.n), 0) from days d left join cnt c on c.day_type = d.dt)
      + (select count(*) from activities
         where owner_id = v_owner and entry_date between p_week_start and p_week_end)
  ) into v_week;

  -- monthly
  with days as (
    select gs::date as d,
           case when extract(dow from gs) in (0, 6) then 'weekend' else 'weekday' end as dt
    from generate_series(p_month_start, p_month_end, interval '1 day') gs
  ),
  cnt as (
    select day_type, count(*) n from activities
    where owner_id = v_owner and entry_date is null group by day_type
  )
  select json_build_object(
    'done', (select count(*) from logs
             where owner_id = v_owner and completed
               and log_date between p_month_start and p_month_end),
    'planned',
      (select coalesce(sum(c.n), 0) from days d left join cnt c on c.day_type = d.dt)
      + (select count(*) from activities
         where owner_id = v_owner and entry_date between p_month_start and p_month_end)
  ) into v_month;

  return json_build_object(
    'owner_name', v_name,
    'today', v_today,
    'week',  v_week,
    'month', v_month
  );
end;
$$;

grant execute on function get_public_progress(text, date, text, date, date, date, date)
  to anon, authenticated;
