import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_SCHEDULE } from '../lib/defaultSchedule';
import { todayISO, dayTypeFor, prettyDate, nowHHMM } from '../lib/dates';

function hhmm(value) {
  return value ? value.slice(0, 5) : '';
}
function arrayMove(arr, from, to) {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const emptyAdd = { title: '', planned_start: '', planned_end: '', category: 'focus', goal_id: '' };

export default function Today() {
  const { user } = useAuth();
  const date = todayISO();
  const dayType = dayTypeFor();

  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState({});
  const [goals, setGoals] = useState([]);
  const [reflection, setReflection] = useState('');
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState(emptyAdd);
  const [showAdd, setShowAdd] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [drag, setDrag] = useState(null);
  const itemRefs = useRef({});
  const metrics = useRef(null);
  const liveDrag = useRef(null);
  const activitiesRef = useRef([]);

  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

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
      supabase.from('reflections').select('*').eq('owner_id', user.id).eq('period_type', 'daily').eq('period_date', date).maybeSingle(),
      supabase.from('goals').select('id, title, period_type, metric').eq('owner_id', user.id).order('created_at', { ascending: true }),
    ]);
    setActivities(actRes.data ?? []);
    const logMap = {};
    (logRes.data ?? []).forEach((l) => { logMap[l.activity_id] = l; });
    setLogs(logMap);
    setReflection(refRes.data?.content ?? '');
    setGoals(goalRes.data ?? []);
    setLoading(false);
  }, [user.id, dayType, date]);

  useEffect(() => { load(); }, [load]);

  async function loadDefaults() {
    const rows = DEFAULT_SCHEDULE.map((a) => ({ ...a, owner_id: user.id }));
    const { error } = await supabase.from('activities').insert(rows);
    if (error) { alert(error.message); return; }
    load();
  }

  async function addEntry(e) {
    e.preventDefault();
    if (!add.title.trim()) return;
    const nextOrder = activities.reduce((m, a) => Math.max(m, a.sort_order), 0) + 1;
    const { error } = await supabase.from('activities').insert({
      owner_id: user.id, title: add.title.trim(), day_type: dayType, category: add.category,
      planned_start: add.planned_start || null, planned_end: add.planned_end || null,
      sort_order: nextOrder, entry_date: date, goal_id: add.goal_id || null,
    });
    if (error) { alert(error.message); return; }
    setAdd(emptyAdd);
    setShowAdd(false);
    load();
  }

  async function removeActivity(a) {
    if (!a.entry_date) {
      const ok = window.confirm(`“${a.title}” is part of your recurring ${a.day_type} routine. Remove it from every ${a.day_type}?`);
      if (!ok) return;
    }
    const { error } = await supabase.from('activities').delete().eq('id', a.id);
    if (error) { alert(error.message); return; }
    load();
  }

  async function updateGoal(a, goalId) {
    setActivities((prev) => prev.map((x) => (x.id === a.id ? { ...x, goal_id: goalId || null } : x)));
    const { error } = await supabase.from('activities').update({ goal_id: goalId || null }).eq('id', a.id);
    if (error) { alert(error.message); load(); }
  }

  function startEdit(a) { setEditingId(a.id); setEditingTitle(a.title); }
  async function saveTitle(a) {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title || title === a.title) return;
    setActivities((prev) => prev.map((x) => (x.id === a.id ? { ...x, title } : x)));
    const { error } = await supabase.from('activities').update({ title }).eq('id', a.id);
    if (error) { alert(error.message); load(); }
  }

  const handleMove = useCallback((e) => {
    const m = metrics.current;
    if (!m) return;
    const dy = e.clientY - m.startY;
    const draggedCenter = m.centers[m.fromIndex] + dy;
    let target = m.fromIndex;
    if (dy > 0) { for (let i = m.fromIndex + 1; i < m.centers.length; i++) if (draggedCenter >= m.centers[i]) target = i; }
    else if (dy < 0) { for (let i = m.fromIndex - 1; i >= 0; i--) if (draggedCenter <= m.centers[i]) target = i; }
    const next = { fromIndex: m.fromIndex, target, dy };
    liveDrag.current = next;
    setDrag(next);
  }, []);

  const handleUp = useCallback(async () => {
    window.removeEventListener('pointermove', handleMove);
    const cur = liveDrag.current;
    metrics.current = null; liveDrag.current = null;
    setDrag(null);
    if (!cur || cur.target === cur.fromIndex) return;
    const base = activitiesRef.current;
    const reordered = arrayMove(base, cur.fromIndex, cur.target).map((a, idx) => ({ ...a, sort_order: idx }));
    setActivities(reordered);
    const updates = reordered.filter((a) => base.find((o) => o.id === a.id)?.sort_order !== a.sort_order);
    const results = await Promise.all(updates.map((a) => supabase.from('activities').update({ sort_order: a.sort_order }).eq('id', a.id)));
    const failed = results.find((r) => r.error);
    if (failed) { alert(failed.error.message); load(); }
  }, [handleMove, load]);

  function onHandleDown(e, fromIndex) {
    e.preventDefault();
    const order = activitiesRef.current;
    const tops = [], heights = [];
    order.forEach((a) => { const r = itemRefs.current[a.id].getBoundingClientRect(); tops.push(r.top); heights.push(r.height); });
    const centers = tops.map((t, i) => t + heights[i] / 2);
    const slot = tops.length > 1 ? tops[1] - tops[0] : heights[0] + 14;
    metrics.current = { tops, heights, centers, slot, startY: e.clientY, fromIndex };
    const init = { fromIndex, target: fromIndex, dy: 0 };
    liveDrag.current = init; setDrag(init);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }

  function dragStyle(index) {
    if (!drag) return undefined;
    if (index === drag.fromIndex) return { transform: `translateY(${drag.dy}px)`, zIndex: 5 };
    const slot = metrics.current?.slot ?? 0;
    if (drag.fromIndex < drag.target && index > drag.fromIndex && index <= drag.target) return { transform: `translateY(${-slot}px)` };
    if (drag.fromIndex > drag.target && index >= drag.target && index < drag.fromIndex) return { transform: `translateY(${slot}px)` };
    return { transform: 'translateY(0px)' };
  }

  async function saveLog(activityId, patch) {
    const existing = logs[activityId] ?? {};
    const merged = { ...existing, owner_id: user.id, activity_id: activityId, log_date: date, completed: existing.completed ?? false, ...patch };
    setLogs((prev) => ({ ...prev, [activityId]: merged }));
    const { data, error } = await supabase.from('logs').upsert(merged, { onConflict: 'owner_id,activity_id,log_date' }).select().maybeSingle();
    if (error) { alert(error.message); return; }
    if (data) setLogs((prev) => ({ ...prev, [activityId]: data }));
  }

  async function saveReflection(content) {
    const { error } = await supabase.from('reflections').upsert(
      { owner_id: user.id, period_type: 'daily', period_date: date, content },
      { onConflict: 'owner_id,period_type,period_date' });
    if (error) alert(error.message);
  }

  if (loading) return <p className="muted loading-state">Loading…</p>;

  const doneCount = activities.filter((a) => logs[a.id]?.completed).length;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p className="eyebrow">{dayType === 'weekend' ? 'Weekend' : 'Weekday'}</p>
        <h1 className="display">{prettyDate()}</h1>
        <p className="tally">{doneCount}/{activities.length} done</p>
      </header>

      {activities.length === 0 ? (
        <div className="card empty">
          <p>Nothing logged for today yet.</p>
          <div className="empty-actions">
            <button type="button" className="btn primary" onClick={() => setShowAdd(true)}>Add an activity</button>
            <button type="button" className="btn" onClick={loadDefaults}>Load the default routine</button>
          </div>
        </div>
      ) : (
        <ul className="activity-list">
          {activities.map((a, i) => {
            const log = logs[a.id] ?? {};
            const completed = !!log.completed;
            const isDragging = drag && drag.fromIndex === i;
            const goal = a.goal_id ? goals.find((g) => g.id === a.goal_id) : null;
            return (
              <li key={a.id} ref={(el) => { if (el) itemRefs.current[a.id] = el; }} style={dragStyle(i)}
                className={`card activity cat-${a.category} ${completed ? 'is-done' : ''} ${isDragging ? 'dragging' : ''}`}>
                <div className="activity-top">
                  <button type="button" className={`check ${completed ? 'checked' : ''}`} aria-pressed={completed}
                    aria-label={completed ? 'Mark not done' : 'Mark done'} onClick={() => saveLog(a.id, { completed: !completed })}>
                    {completed ? '✓' : ''}
                  </button>
                  <div className="activity-meta">
                    {editingId === a.id ? (
                      <input type="text" className="title-input" autoFocus value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)} onBlur={() => saveTitle(a)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingId(null); }} />
                    ) : (
                      <span className="title-row">
                        <span className="activity-title">{a.title}</span>
                        {a.entry_date && <span className="badge">one-off</span>}
                        {goal && <span className="badge goal">◎ {goal.title}</span>}
                        <button type="button" className="icon-btn ghost" aria-label="Edit name" onClick={() => startEdit(a)}>✎</button>
                      </span>
                    )}
                    <span className="muted small">Planned {hhmm(a.planned_start) || '—'}–{hhmm(a.planned_end) || '—'}</span>
                    {goals.length > 0 && (
                      <label className="goal-assign muted small">
                        Counts toward:{' '}
                        <select value={a.goal_id || ''} onChange={(e) => updateGoal(a, e.target.value)}>
                          <option value="">— none —</option>
                          {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="row-tools">
                    <button type="button" className="icon-btn drag-handle" aria-label="Drag to reorder" onPointerDown={(e) => onHandleDown(e, i)}>⠿</button>
                    <button type="button" className="icon-btn danger" aria-label="Remove" onClick={() => removeActivity(a)}>×</button>
                  </div>
                </div>

                <div className="time-row">
                  <div className="time-field">
                    <label><span className="small muted">Started</span>
                      <input type="time" value={hhmm(log.actual_start)} onChange={(e) => saveLog(a.id, { actual_start: e.target.value || null })} /></label>
                    <button type="button" className="now-btn" onClick={() => saveLog(a.id, { actual_start: nowHHMM() })}>Now</button>
                  </div>
                  <div className="time-field">
                    <label><span className="small muted">Ended</span>
                      <input type="time" value={hhmm(log.actual_end)} onChange={(e) => saveLog(a.id, { actual_end: e.target.value || null })} /></label>
                    <button type="button" className="now-btn" onClick={() => saveLog(a.id, { actual_end: nowHHMM() })}>Now</button>
                  </div>
                </div>

                <input type="text" className="note-input" placeholder="Add a note…" defaultValue={log.note ?? ''}
                  onBlur={(e) => { if ((e.target.value || '') !== (log.note || '')) saveLog(a.id, { note: e.target.value }); }} />
              </li>
            );
          })}
        </ul>
      )}

      {showAdd ? (
        <form onSubmit={addEntry} className="card add-form">
          <h2 className="section-title">Add to today</h2>
          <div className="form-grid">
            <label className="field"><span>Title</span>
              <input type="text" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="What did you do?" required /></label>
            <label className="field"><span>Category</span>
              <select value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value })}>
                <option value="focus">Focus</option><option value="move">Move</option><option value="rest">Rest</option>
              </select></label>
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
        activities.length > 0 && (
          <button type="button" className="btn" onClick={() => setShowAdd(true)}>+ Add to today</button>
        )
      )}

      <section className="card reflection-card">
        <h2 className="section-title">Today&rsquo;s reflection</h2>
        <textarea className="reflection" rows={4} placeholder="How did today go?" value={reflection}
          onChange={(e) => setReflection(e.target.value)} onBlur={(e) => saveReflection(e.target.value)} />
      </section>
    </div>
  );
}
