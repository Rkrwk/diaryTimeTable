import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { firstOfMonth, toISODate, dayTypeFor, monthMatrix, fmtMins } from '../lib/dates';
import { loadGoalActual, goalPctOf } from '../lib/goalProgress';

function goalLabel(g, actual) {
  return g.metric === 'hours' ? `${fmtMins(actual)} of ${g.target}h` : `${actual} of ${g.target} done`;
}

export default function Monthly() {
  const { user } = useAuth();
  const now = new Date();
  const first = firstOfMonth(now);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const days = Array.from({ length: last.getDate() }, (_, i) => new Date(now.getFullYear(), now.getMonth(), i + 1));
  const weeks = monthMatrix(now);
  const monthKey = toISODate(first);
  const startISO = toISODate(first);
  const endISO = toISODate(last);
  const todayISOv = toISODate(now);
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

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
      supabase.from('reflections').select('content').eq('owner_id', user.id).eq('period_type', 'monthly').eq('period_date', monthKey).maybeSingle(),
      supabase.from('goals').select('*').eq('owner_id', user.id).eq('period_type', 'monthly').order('created_at', { ascending: true }),
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
  }, [user.id, startISO, endISO, monthKey]);

  useEffect(() => { load(); }, [load]);

  async function saveReflection(content) {
    const { error } = await supabase.from('reflections').upsert(
      { owner_id: user.id, period_type: 'monthly', period_date: monthKey, content }, { onConflict: 'owner_id,period_type,period_date' });
    if (error) alert(error.message);
  }

  function plannedFor(date) { return (counts[dayTypeFor(date)] ?? 0) + (oneOffs[toISODate(date)] ?? 0); }
  function doneFor(iso) { return logs.filter((l) => l.log_date === iso && l.completed).length; }

  const totalPlanned = days.reduce((s, d) => s + plannedFor(d), 0);
  const totalDone = logs.filter((l) => l.completed).length;
  const pctDone = totalPlanned === 0 ? 0 : Math.round((totalDone / totalPlanned) * 100);

  if (loading) return <p className="muted loading-state">Loading…</p>;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="stack-lg">
      <header className="page-head"><p className="eyebrow">{monthLabel}</p><h1 className="display">Monthly</h1></header>

      <section className="card stat-card">
        <p className="big-stat">{pctDone}%</p>
        <p className="muted">{totalDone} of {totalPlanned} planned activities completed this month</p>
      </section>

      <div className="cal">
        <div className="cal-head">{dow.map((d) => <span key={d} className="cal-dow">{d}</span>)}</div>
        {weeks.map((week, wi) => (
          <div key={wi} className="cal-row">
            {week.map((d, di) => {
              if (!d) return <span key={di} className="cal-cell empty" />;
              const iso = toISODate(d);
              const planned = plannedFor(d);
              const done = doneFor(iso);
              const ratio = planned ? done / planned : 0;
              const lvl = done === 0 ? 0 : ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : 1;
              return (
                <Link key={di} to={`/day/${iso}`} className={`cal-cell lvl-${lvl} ${iso === todayISOv ? 'is-today' : ''}`}>
                  <span className="cal-date">{d.getDate()}</span>
                  <span className="cal-score">{done}/{planned}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <section className="card stack">
        <h2 className="section-title">Monthly goals</h2>
        {goals.length === 0 ? (
          <p className="muted">No monthly goals. <Link to="/goals">Add one</Link> and tag activities to it.</p>
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
        <h2 className="section-title">Monthly reflection</h2>
        <textarea className="reflection" rows={5} placeholder="Zoom out: how did the month go?" value={reflection}
          onChange={(e) => setReflection(e.target.value)} onBlur={(e) => saveReflection(e.target.value)} />
      </section>
    </div>
  );
}
