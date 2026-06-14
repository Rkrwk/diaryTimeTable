import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { parseISO, dayTypeFor, prettyDate, durationMins, fmtMins, todayISO } from '../lib/dates';

function hhmm(value) {
  return value ? value.slice(0, 5) : '';
}

const emptyAdd = { title: '', category: 'focus', planned_start: '', planned_end: '', goal_id: '' };

// Detail for a single day (the signed-in user's own data).
// Past/today: read-only record. Future: you can also plan activities ahead.
export default function DayDetail() {
  const { date } = useParams();
  const { user } = useAuth();
  const dayType = dayTypeFor(parseISO(date));
  const isFuture = date > todayISO();

  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState({});
  const [goals, setGoals] = useState([]);
  const [reflection, setReflection] = useState('');
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState(emptyAdd);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [actRes, logRes, refRes, goalRes] = await Promise.all([
      supabase
        .from('activities')
        .select('*')
        .eq('owner_id', user.id)
        .or(`and(day_type.eq.${dayType},entry_date.is.null),entry_date.eq.${date}`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('logs').select('*').eq('owner_id', user.id).eq('log_date', date),
      supabase
        .from('reflections')
        .select('content')
        .eq('owner_id', user.id)
        .eq('period_type', 'daily')
        .eq('period_date', date)
        .maybeSingle(),
      supabase.from('goals').select('id, title').eq('owner_id', user.id).order('created_at', { ascending: true }),
    ]);
    setActivities(actRes.data ?? []);
    const m = {};
    (logRes.data ?? []).forEach((l) => { m[l.activity_id] = l; });
    setLogs(m);
    setReflection(refRes.data?.content ?? '');
    setGoals(goalRes.data ?? []);
    setLoading(false);
  }, [user.id, dayType, date]);

  useEffect(() => { load(); }, [load]);

  async function addEntry(e) {
    e.preventDefault();
    if (!add.title.trim()) return;
    const nextOrder = activities.reduce((mx, a) => Math.max(mx, a.sort_order), 0) + 1;
    const { error } = await supabase.from('activities').insert({
      owner_id: user.id,
      title: add.title.trim(),
      day_type: dayType,
      category: add.category.trim() || 'rest',
      planned_start: add.planned_start || null,
      planned_end: add.planned_end || null,
      sort_order: nextOrder,
      entry_date: date,
      goal_id: add.goal_id || null,
    });
    if (error) { alert(error.message); return; }
    setAdd(emptyAdd);
    setShowAdd(false);
    load();
  }

  async function removeActivity(a) {
    const { error } = await supabase.from('activities').delete().eq('id', a.id);
    if (error) { alert(error.message); return; }
    load();
  }

  if (loading) return <p className="muted loading-state">Loading…</p>;

  const doneCount = activities.filter((a) => logs[a.id]?.completed).length;
  const totalMins = activities.reduce((sum, a) => {
    const l = logs[a.id];
    return sum + (l ? durationMins(hhmm(l.actual_start), hhmm(l.actual_end)) : 0);
  }, 0);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p className="eyebrow">{isFuture ? 'Planned · ' : ''}{dayType === 'weekend' ? 'Weekend' : 'Weekday'}</p>
        <h1 className="display">{prettyDate(parseISO(date))}</h1>
        <p className="tally">
          {isFuture ? `${activities.length} planned` : `${doneCount}/${activities.length} done · ${fmtMins(totalMins)} active`}
        </p>
      </header>

      {activities.length === 0 ? (
        <p className="muted">{isFuture ? 'Nothing planned for this day yet.' : 'No activities recorded for this day.'}</p>
      ) : (
        <ul className="activity-list">
          {activities.map((a) => {
            const log = logs[a.id] ?? {};
            const completed = !!log.completed;
            const goal = a.goal_id ? goals.find((g) => g.id === a.goal_id) : null;
            return (
              <li key={a.id} className={`card activity cat-${a.category} ${completed ? 'is-done' : ''}`}>
                <div className="activity-top">
                  {!isFuture && (
                    <span className={`check readonly ${completed ? 'checked' : ''}`}>{completed ? '✓' : ''}</span>
                  )}
                  <div className="activity-meta">
                    <span className="title-row">
                      <span className="activity-title">{a.title}</span>
                      {a.entry_date && <span className="badge">one-off</span>}
                      {goal && <span className="badge goal">◎ {goal.title}</span>}
                    </span>
                    <span className="muted small">
                      Planned {hhmm(a.planned_start) || '—'}–{hhmm(a.planned_end) || '—'}
                      {(log.actual_start || log.actual_end) && (
                        <>{' · actual '}{hhmm(log.actual_start) || '—'}–{hhmm(log.actual_end) || '—'}</>
                      )}
                    </span>
                  </div>
                  {isFuture && a.entry_date && (
                    <button type="button" className="icon-btn danger" aria-label="Remove" style={{ marginLeft: 'auto' }} onClick={() => removeActivity(a)}>×</button>
                  )}
                </div>
                {log.note && <p className="view-note">{log.note}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {isFuture && (showAdd ? (
        <form onSubmit={addEntry} className="card add-form">
          <h2 className="section-title">Plan an activity</h2>
          <div className="form-grid">
            <label className="field"><span>Title</span>
              <input type="text" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="What will you do?" required /></label>
            <label className="field"><span>Category</span>
              <input list="cat-presets" value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value })} placeholder="focus, move, rest, or your own" />
              <datalist id="cat-presets"><option value="focus" /><option value="move" /><option value="rest" /></datalist></label>
            <label className="field"><span>Start</span>
              <input type="time" value={add.planned_start} onChange={(e) => setAdd({ ...add, planned_start: e.target.value })} /></label>
            <label className="field"><span>End</span>
              <input type="time" value={add.planned_end} onChange={(e) => setAdd({ ...add, planned_end: e.target.value })} /></label>
            {goals.length > 0 && (
              <label className="field"><span>Counts toward goal</span>
                <select value={add.goal_id} onChange={(e) => setAdd({ ...add, goal_id: e.target.value })}>
                  <option value="">— none —</option>
                  {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select></label>
            )}
          </div>
          <div className="empty-actions">
            <button type="submit" className="btn primary">Add</button>
            <button type="button" className="btn" onClick={() => { setShowAdd(false); setAdd(emptyAdd); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => setShowAdd(true)}>+ Plan an activity</button>
      ))}

      {!isFuture && (
        <section className="card reflection-card">
          <h2 className="section-title">Day reflection</h2>
          {reflection ? <p className="reflection-text">{reflection}</p> : <p className="muted">No reflection written.</p>}
        </section>
      )}

      <div className="empty-actions">
        <Link to="/weekly" className="btn">← Weekly</Link>
        <Link to="/monthly" className="btn">Monthly</Link>
      </div>
    </div>
  );
}
