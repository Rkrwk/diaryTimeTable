import { mondayOf, toISODate, firstOfMonth, durationMins } from './dates';

// ISO start/end for a goal's current period.
export function periodRange(period, base = new Date()) {
  if (period === 'weekly') {
    const monday = mondayOf(base);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startISO: toISODate(monday), endISO: toISODate(sunday) };
  }
  const first = firstOfMonth(base);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { startISO: toISODate(first), endISO: toISODate(last) };
}

// Actual progress for a goal: minutes (metric 'hours') or completion count (metric 'count').
export async function loadGoalActual(supabase, ownerId, goal) {
  const { startISO, endISO } = periodRange(goal.period_type);
  const { data } = await supabase
    .from('logs')
    .select('completed, actual_start, actual_end, activities!inner(goal_id)')
    .eq('owner_id', ownerId)
    .eq('activities.goal_id', goal.id)
    .gte('log_date', startISO)
    .lte('log_date', endISO);
  const rows = data ?? [];
  if (goal.metric === 'count') return rows.filter((r) => r.completed).length;
  return rows.reduce((s, r) => s + durationMins(r.actual_start, r.actual_end), 0);
}

// target expressed in the same unit as actual (minutes for hours-goals)
export function goalTargetUnit(goal) {
  return goal.metric === 'hours' ? Number(goal.target) * 60 : Number(goal.target);
}

export function goalPctOf(actual, goal) {
  const t = goalTargetUnit(goal);
  return !t ? 0 : Math.min(100, Math.round((actual / t) * 100));
}
