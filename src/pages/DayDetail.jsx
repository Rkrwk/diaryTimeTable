import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { parseISO, dayTypeFor, prettyDate, durationMins, fmtMins } from '../lib/dates';

function hhmm(value) {
  return value ? value.slice(0, 5) : '';
}

// Full read-only detail for a single day (the signed-in user's own data).
export default function DayDetail() {
  const { date } = useParams();
  const { user } = useAuth();
  const dayType = dayTypeFor(parseISO(date));

  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState({});
  const [reflection, setReflection] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [actRes, logRes, refRes] = await Promise.all([
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
    ]);
    setActivities(actRes.data ?? []);
    const m = {};
    (logRes.data ?? []).forEach((l) => {
      m[l.activity_id] = l;
    });
    setLogs(m);
    setReflection(refRes.data?.content ?? '');
    setLoading(false);
  }, [user.id, dayType, date]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="muted loading-state">Loading…</p>;

  const doneCount = activities.filter((a) => logs[a.id]?.completed).length;
  const totalMins = activities.reduce((sum, a) => {
    const l = logs[a.id];
    return sum + (l ? durationMins(hhmm(l.actual_start), hhmm(l.actual_end)) : 0);
  }, 0);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p className="eyebrow">{dayType === 'weekend' ? 'Weekend' : 'Weekday'}</p>
        <h1 className="display">{prettyDate(parseISO(date))}</h1>
        <p className="tally">
          {doneCount}/{activities.length} done · {fmtMins(totalMins)} active
        </p>
      </header>

      {activities.length === 0 ? (
        <p className="muted">No activities recorded for this day.</p>
      ) : (
        <ul className="activity-list">
          {activities.map((a) => {
            const log = logs[a.id] ?? {};
            const completed = !!log.completed;
            return (
              <li key={a.id} className={`card activity cat-${a.category} ${completed ? 'is-done' : ''}`}>
                <div className="activity-top">
                  <span className={`check readonly ${completed ? 'checked' : ''}`}>
                    {completed ? '✓' : ''}
                  </span>
                  <div className="activity-meta">
                    <span className="title-row">
                      <span className="activity-title">{a.title}</span>
                      {a.entry_date && <span className="badge">one-off</span>}
                    </span>
                    <span className="muted small">
                      Planned {hhmm(a.planned_start) || '—'}–{hhmm(a.planned_end) || '—'}
                      {(log.actual_start || log.actual_end) && (
                        <>
                          {' · actual '}
                          {hhmm(log.actual_start) || '—'}–{hhmm(log.actual_end) || '—'}
                        </>
                      )}
                    </span>
                  </div>
                </div>
                {log.note && <p className="view-note">{log.note}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <section className="card reflection-card">
        <h2 className="section-title">Day reflection</h2>
        {reflection ? <p className="reflection-text">{reflection}</p> : <p className="muted">No reflection written.</p>}
      </section>

      <div className="empty-actions">
        <Link to="/weekly" className="btn">← Weekly</Link>
        <Link to="/monthly" className="btn">Monthly</Link>
      </div>
    </div>
  );
}
