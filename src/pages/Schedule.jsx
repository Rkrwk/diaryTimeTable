import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function hhmm(value) {
  return value ? value.slice(0, 5) : '';
}

const emptyForm = {
  title: '',
  day_type: 'weekday',
  category: 'focus',
  planned_start: '',
  planned_end: '',
};

export default function Schedule() {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('activities')
      .select('*')
      .eq('owner_id', user.id)
      .is('entry_date', null)
      .order('day_type', { ascending: true })
      .order('sort_order', { ascending: true });
    setActivities(data ?? []);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function addActivity(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);

    const sameType = activities.filter((a) => a.day_type === form.day_type);
    const nextOrder =
      sameType.reduce((max, a) => Math.max(max, a.sort_order), 0) + 1;

    const { error } = await supabase.from('activities').insert({
      owner_id: user.id,
      title: form.title.trim(),
      day_type: form.day_type,
      category: form.category,
      planned_start: form.planned_start || null,
      planned_end: form.planned_end || null,
      sort_order: nextOrder,
    });

    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setForm(emptyForm);
    load();
  }

  async function removeActivity(id) {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  const groups = [
    { key: 'weekday', label: 'Weekday' },
    { key: 'weekend', label: 'Weekend' },
  ];

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p className="eyebrow">Template</p>
        <h1 className="display">Schedule</h1>
      </header>

      <form onSubmit={addActivity} className="card add-form">
        <h2 className="section-title">Add an activity</h2>
        <div className="form-grid">
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Deep focus block"
              required
            />
          </label>
          <label className="field">
            <span>Day type</span>
            <select value={form.day_type} onChange={(e) => update('day_type', e.target.value)}>
              <option value="weekday">Weekday</option>
              <option value="weekend">Weekend</option>
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <input list="cat-presets" value={form.category} onChange={(e) => update('category', e.target.value)} placeholder="focus, move, rest, or your own" />
            <datalist id="cat-presets"><option value="focus" /><option value="move" /><option value="rest" /></datalist>
          </label>
          <label className="field">
            <span>Start</span>
            <input
              type="time"
              value={form.planned_start}
              onChange={(e) => update('planned_start', e.target.value)}
            />
          </label>
          <label className="field">
            <span>End</span>
            <input
              type="time"
              value={form.planned_end}
              onChange={(e) => update('planned_end', e.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add activity'}
        </button>
      </form>

      {loading ? (
        <p className="muted loading-state">Loading…</p>
      ) : (
        groups.map((g) => {
          const rows = activities.filter((a) => a.day_type === g.key);
          return (
            <section key={g.key} className="stack">
              <h2 className="section-title">{g.label}</h2>
              {rows.length === 0 ? (
                <p className="muted">No {g.label.toLowerCase()} activities yet.</p>
              ) : (
                <ul className="template-list">
                  {rows.map((a) => (
                    <li key={a.id} className={`card template-row cat-${a.category}`}>
                      <div className="template-meta">
                        <span className="activity-title">{a.title}</span>
                        <span className="muted small">
                          {hhmm(a.planned_start)}–{hhmm(a.planned_end)} · {a.category}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => removeActivity(a.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
