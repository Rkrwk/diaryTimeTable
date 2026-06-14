import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { mondayOf, toISODate, dayTypeFor, fmtMins } from '../lib/dates';
import { loadGoalActual, goalPctOf } from '../lib/goalProgress';

function goalLabel(g, actual) {
  return g.metric === 'hours' ? `${fmtMins(actual)} of ${g.target}h` : `${actual} of ${g.target} done`;
}

export default function Weekly() {
  const { user } = useAuth();
  const monday = mondayOf(new Date());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const weekKey = toISODate(monday);
  const startISO = toISODate(days[0]);
  const endISO = toISODate(days[6]);

  const [counts, setCounts] = useState({ weekday: 0, weekend: 0 });
  const [oneOffs, setOneOffs] = useState({});
  const [logs, setLogs] = useState([]);
  const [reflection, setReflection] = useState('');
  const [goals, setGoals] = useState([]);
  const [actuals, setActuals] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [actRes, oneRes, logRes, refRes, goalRes] = await Promise.all([
      supabase.from('activities').select('day_type').eq('owner_id', user.id).is('entry_date', null),
      supabase.from('activities').select('entry_date').eq('owner_id', user.id).gte('entry_date', startISO).lte('entry_date', endISO),
      supabase.from('logs').select('log_date, completed').eq('owner_id', user.id).gte('log_date', startISO).lte('log_date', endISO),
      supabase.from('reflections').select('content').eq('owner_id', user.id).eq('period_type', 'weekly').eq('period_date', weekKey).maybeSingle(),
      supabase.from('goals').select('*').eq('owner_id', user.id).eq('period_type', 'weekly').order('created_at', { ascending: true }),
    ]);
    const c = { weekday: 0, weekend: 0 };
    (actRes.data ?? []).forEach((a) => { c[a.day_type] = (c[a.day_type] ?? 0) + 1; });
    setCounts(c);
    const o = {};
    (oneRes.data ?? []).forEach((a) => { o[a.entry_date] = (o[a.entry_date] ?? 0) + 1; });
    setOneOffs(o);
    setLogs(logRes.data ?? []);
    setReflection(refRes.data?.content ?? '');
    const gl = goalRes.data ?? [];
    setGoals(gl);
    const entries = await Promise.all(gl.map(async (g) => [g.id, await loadGoalActual(supabase, user.id, g)]));
    setActuals(Object.fromEntries(entries));
    setLoading(false);
  }, [user.id, startISO, endISO, weekKey]);

  useEffect(() => { load(); }, [load]);

  async function saveReflection(content) {
    const { error } = await supabase.from('reflections').upsert(
      { owner_id: user.id, period_type: 'weekly', period_date: weekKey, content }, { onConflict: 'owner_id,period_type,period_date' });
    if (error) alert(error.message);
  }

  function plannedFor(date) { return (counts[dayTypeFor(date)] ?? 0) + (oneOffs[toISODate(date)] ?? 0); }
  function doneFor(date) { const iso = toISODate(date); return logs.filter((l) => l.log_date === iso && l.completed).length; }

  const totalPlanned = days.reduce((s, d) => s + plannedFor(d), 0);
  const totalDone = days.reduce((s, d) => s + doneFor(d), 0);
  const pctDone = totalPlanned === 0 ? 0 : Math.round((totalDone / totalPlanned) * 100);

  if (loading) return <p className="muted loading-state">Loading…</p>;
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="stack-lg">
      <header className="page-head"><p className="eyebrow">Week of {startISO}</p><h1 className="display">Weekly</h1></header>

      <section className="card stat-card">
        <p className="big-stat">{pctDone}%</p>
        <p className="muted">{totalDone} of {totalPlanned} planned activities completed this week</p>
      </section>

      <div className="week-grid">
        {days.map((d, i) => (
          <Link key={i} to={`/day/${toISODate(d)}`} className="day-cell card day-link">
            <span className="day-label">{labels[i]}</span>
            <span className="day-date">{d.getDate()}</span>
            <span className="day-score">{doneFor(d)}/{plannedFor(d)}</span>
          </Link>
        ))}
      </div>

      <section className="card stack">
        <h2 className="section-title">Weekly goals</h2>
        {goals.length === 0 ? (
          <p className="muted">No weekly goals. <Link to="/goals">Add one</Link> and tag activities to it.</p>
        ) : goals.map((g) => {
          const actual = actuals[g.id] ?? 0;
          const pct = goalPctOf(actual, g);
          return (
            <div key={g.id} className="stack goal-mini">
              <div className="goal-head"><span className="activity-title">{g.title}</span><span className="muted small">{pct}%</span></div>
              <div className="goal-bar"><div className="goal-fill" style={{ width: `${pct}%` }} /></div>
              <p className="muted small">{goalLabel(g, actual)}</p>
            </div>
          );
        })}
      </section>

      <section className="card reflection-card">
        <h2 className="section-title">Weekly reflection</h2>
        <p className="muted small">Tip: wrap private text in /* */ (an unclosed /* hides everything after). Shared viewers will not see it.</p>
        <textarea className="reflection" rows={4} placeholder="What went well? What to adjust?" value={reflection}
          onChange={(e) => setReflection(e.target.value)} onBlur={(e) => saveReflection(e.target.value)} />
      </section>
    </div>
  );
}
