-- Run this ONCE in the Supabase SQL Editor. Replaces the earlier "time goal"
-- with activity-linked goals: each goal has a period (weekly/monthly), a metric
-- (hours or count) and a target; activities can be tagged to count toward a goal.
-- NOTE: this drops the previous goals table (it only held a single time target).
-- Safe to run on an existing database. A fresh schema.sql already includes this.

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
create or replace function get_public_progress(
  p_code text, p_today date, p_day_type text,
  p_week_start date, p_week_end date, p_month_start date, p_month_end date
)
returns json
language plpgsql security definer stable set search_path = public as $$
declare
  v_owner uuid; v_name text;
  v_today json; v_week json; v_month json; v_cal json; v_goals json;
begin
  select id, coalesce(display_name, username) into v_owner, v_name
  from profiles where share_code = upper(p_code);
  if v_owner is null then return null; end if;

  select coalesce(json_agg(json_build_object(
    'title', a.title, 'category', a.category,
    'planned_start', to_char(a.planned_start,'HH24:MI'), 'planned_end', to_char(a.planned_end,'HH24:MI'),
    'completed', coalesce(l.completed,false),
    'actual_start', to_char(l.actual_start,'HH24:MI'), 'actual_end', to_char(l.actual_end,'HH24:MI'),
    'note', l.note) order by a.sort_order, a.created_at), '[]'::json)
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

  return json_build_object('owner_name',v_name,'today',v_today,'week',v_week,'month',v_month,'calendar',v_cal,'goals',v_goals);
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
    'note', l.note) order by a.sort_order, a.created_at), '[]'::json)
    into v_acts
  from activities a
  left join logs l on l.activity_id = a.id and l.owner_id = v_owner and l.log_date = p_date
  where a.owner_id = v_owner and ((a.day_type = v_daytype and a.entry_date is null) or a.entry_date = p_date);

  return json_build_object('owner_name',v_name,'date',to_char(p_date,'YYYY-MM-DD'),
    'activities',v_acts,
    'reflection',(select content from reflections where owner_id=v_owner and period_type='daily' and period_date=p_date));
end;
$$;

grant execute on function get_public_day(text, date) to anon, authenticated;
