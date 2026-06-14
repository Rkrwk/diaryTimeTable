-- Run this ONCE in the Supabase SQL Editor. The single-day public view now also
-- returns that day's WEEK and MONTH reflections (privacy-stripped), so a shared
-- viewer can see them when browsing a day in a different week/month.

create or replace function get_public_day(p_code text, p_date date)
returns json
language plpgsql security definer stable set search_path = public as $$
declare
  v_owner uuid; v_name text;
  v_daytype text := case when extract(dow from p_date) in (0,6) then 'weekend' else 'weekday' end;
  v_wk date := date_trunc('week',  p_date)::date;  -- Monday of that week
  v_mo date := date_trunc('month', p_date)::date;  -- first of that month
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

  return json_build_object(
    'owner_name', v_name,
    'date', to_char(p_date,'YYYY-MM-DD'),
    'activities', v_acts,
    'week_start',  to_char(v_wk,'YYYY-MM-DD'),
    'week_reflection',  strip_private((select content from reflections where owner_id=v_owner and period_type='weekly'  and period_date=v_wk)),
    'month_start', to_char(v_mo,'YYYY-MM-DD'),
    'month_reflection', strip_private((select content from reflections where owner_id=v_owner and period_type='monthly' and period_date=v_mo))
  );
end;
$$;

grant execute on function get_public_day(text, date) to anon, authenticated;
